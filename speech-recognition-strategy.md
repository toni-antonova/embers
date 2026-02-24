# Speech Recognition Strategy: Web Speech API + Moonshine Fallback

## Overview

Implement a hybrid speech recognition system for the web app. Use the browser-native Web Speech API as the primary method on platforms where it works reliably. Fall back to Moonshine Tiny (running 100% locally in the browser via Transformers.js) on platforms where the Web Speech API is broken or unavailable — primarily iOS. If the Moonshine model cannot load within 5 seconds (e.g., first visit on a slow mobile connection), gracefully degrade to a text input with a user-facing message.

---

## Architecture

```
User taps "Record"
        │
        ▼
┌──────────────────────┐
│ Can we use Web Speech │──── YES ──▶ Use Web Speech API
│ API reliably?         │            (no model download needed)
└──────────────────────┘
        │ NO
        ▼
┌──────────────────────┐
│ Is Moonshine model    │──── YES ──▶ Use Moonshine Tiny
│ cached or loads < 5s? │            (local, offline, private)
└──────────────────────┘
        │ NO (timeout after 5s)
        ▼
┌──────────────────────┐
│ Show message:         │
│ "Your connection is   │
│ slow — please type    │
│ your message instead" │
│ + text input fallback │
└──────────────────────┘
```

---

## Step 1: Detect Platform and Choose Strategy

```js
function getSpeechStrategy() {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroidChrome = /Android/.test(ua) && /Chrome\//.test(ua);

  const hasWebSpeechAPI = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;

  // Web Speech API works well on Android Chrome (uses Google's servers).
  // On iOS, ALL browsers use WebKit under the hood (Apple policy), and
  // Safari's SpeechRecognition implementation is buggy:
  //   - Transcripts get duplicated
  //   - Recognition silently stops after first result
  //   - Siri interferes with mic access
  //   - isFinal is sometimes never set to true
  // So we skip Web Speech API entirely on iOS and go straight to Moonshine.

  if (hasWebSpeechAPI && !isIOS) {
    return 'web-speech-api';
  }

  return 'moonshine';
}
```

---

## Step 2: Web Speech API Implementation (Android Chrome / Desktop Chrome)

When the Web Speech API is the chosen strategy, use it directly. Key settings:

- Set `interimResults = true` — this is critical on all platforms for responsive behavior.
- Set `continuous = true` for ongoing transcription, or `false` for single-utterance voice commands.
- Listen for `onend` and restart recognition automatically if the user hasn't explicitly stopped. Safari and some Chrome versions silently stop recognition without firing `onerror`.
- Serve the page over HTTPS (required — secure context only).

```js
function startWebSpeechRecognition({ onResult, onError }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();

  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.continuous = true;

  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map(result => result[0].transcript)
      .join('');
    const isFinal = event.results[event.results.length - 1].isFinal;
    onResult({ transcript, isFinal });
  };

  recognition.onerror = (event) => {
    onError(event.error);
  };

  // Auto-restart on unexpected end (Chrome/Safari sometimes just stop)
  recognition.onend = () => {
    // Only restart if user hasn't explicitly stopped
    if (!recognition._userStopped) {
      recognition.start();
    }
  };

  recognition._userStopped = false;
  recognition.start();

  return {
    stop: () => {
      recognition._userStopped = true;
      recognition.stop();
    }
  };
}
```

---

## Step 3: Moonshine Fallback Implementation

### Reference Implementation

The official Moonshine Web example (React + Vite) is here:
**https://github.com/huggingface/transformers.js-examples/tree/main/moonshine-web**

Study this repo closely. It demonstrates the complete pattern: model loading, Web Worker offloading, audio capture, and WebGPU with WASM fallback. Use it as the foundation for the implementation.

### Dependencies

```json
{
  "@huggingface/transformers": "^3.8.1"
}
```

Use Transformers.js **v3** (stable). Do NOT use v4 — it is still in preview under the `next` npm tag and is not production-ready. Moonshine support was added in v3.2.0.

### Model Configuration

Use the model `onnx-community/moonshine-tiny-ONNX`. This is the 27M parameter Moonshine Tiny model converted to ONNX format for browser use.

Load it with this configuration for the best size/performance tradeoff:

```js
import {
  AutoTokenizer,
  AutoProcessor,
  MoonshineForConditionalGeneration
} from '@huggingface/transformers';

const model_id = 'onnx-community/moonshine-tiny-ONNX';

const tokenizer = await AutoTokenizer.from_pretrained(model_id);
const processor = await AutoProcessor.from_pretrained(model_id);
const model = await MoonshineForConditionalGeneration.from_pretrained(model_id, {
  dtype: {
    encoder_model: 'fp32',
    decoder_model_merged: 'q4',   // 4-bit quantized decoder — much smaller download
  },
  device: 'webgpu',               // Falls back to WASM automatically if WebGPU unavailable
});
```

The q4-quantized model is approximately **~50MB** total download. After the first download, Transformers.js automatically caches it in the browser's Cache API (`transformers-cache`), so subsequent visits load from local storage with zero network cost.

### Web Worker (Required)

All model inference MUST run in a Web Worker. If you run it on the main thread, the UI will freeze during transcription. The official example demonstrates this pattern.

Create a `worker.js` that:
1. Imports Transformers.js
2. Loads the model on first message (or on worker init)
3. Accepts audio chunks from the main thread via `postMessage`
4. Runs inference and posts transcription results back

The main thread captures audio via the **MediaRecorder API** every ~800ms and sends chunks to the worker.

### Audio Capture

```js
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const mediaRecorder = new MediaRecorder(stream);

mediaRecorder.ondataavailable = (event) => {
  if (event.data.size > 0) {
    // Send audio blob to the Web Worker for transcription
    worker.postMessage({ type: 'transcribe', audio: event.data });
  }
};

// Capture in 800ms chunks
mediaRecorder.start(800);
```

---

## Step 4: The 5-Second Timeout Fallback

This is the critical UX safeguard. If the Moonshine model is not cached and the user is on a slow connection, the ~50MB download could take 30+ seconds. Do not make the user wait. Instead, race the model load against a 5-second timer.

```js
async function initMoonshineWithTimeout(worker, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('MODEL_LOAD_TIMEOUT'));
    }, timeoutMs);

    // Ask the worker to load the model
    worker.postMessage({ type: 'init_model' });

    // Worker posts back when model is ready
    worker.onmessage = (event) => {
      if (event.data.type === 'model_ready') {
        clearTimeout(timer);
        resolve();
      }
      if (event.data.type === 'model_error') {
        clearTimeout(timer);
        reject(new Error(event.data.error));
      }
    };
  });
}
```

### Using the Timeout

```js
async function startSpeechRecognition({ onResult, onError, onFallbackToText }) {
  const strategy = getSpeechStrategy();

  if (strategy === 'web-speech-api') {
    return startWebSpeechRecognition({ onResult, onError });
  }

  // strategy === 'moonshine'
  const worker = new Worker(new URL('./moonshine-worker.js', import.meta.url), {
    type: 'module'
  });

  try {
    await initMoonshineWithTimeout(worker, 5000);
    // Model loaded — start audio capture and transcription
    return startMoonshineRecognition(worker, { onResult, onError });
  } catch (err) {
    if (err.message === 'MODEL_LOAD_TIMEOUT') {
      // Model is still downloading in the background (don't kill the worker).
      // Show the user a text input fallback.
      onFallbackToText({
        message: "Your connection seems slow — please type your message instead.",
        // Optionally: keep loading in background so it's ready next time
        cancelBackgroundLoad: () => worker.terminate()
      });
    } else {
      onError(err);
    }
  }
}
```

### Important: Keep Loading in the Background

Even when the 5-second timeout fires and you show the text input, **do not terminate the worker**. Let the model continue downloading in the background. That way, the cache gets populated and the model will be instantly available next time. Only terminate if the user navigates away.

---

## Step 5: Service Worker Pre-Caching (Eliminate First-Load Delay)

To avoid the 5-second timeout ever firing for most users, pre-cache the model files using a service worker as soon as the user first visits your site — before they ever try to use speech recognition.

```js
// In your service worker (sw.js):
const MOONSHINE_MODEL_FILES = [
  'https://huggingface.co/onnx-community/moonshine-tiny-ONNX/resolve/main/onnx/encoder_model.onnx',
  'https://huggingface.co/onnx-community/moonshine-tiny-ONNX/resolve/main/onnx/decoder_model_merged_q4.onnx',
  'https://huggingface.co/onnx-community/moonshine-tiny-ONNX/resolve/main/tokenizer.json',
  'https://huggingface.co/onnx-community/moonshine-tiny-ONNX/resolve/main/preprocessor_config.json',
];

// NOTE: The URLs above are illustrative. Check the actual file paths in
// the onnx-community/moonshine-tiny-ONNX repo on HuggingFace and in the
// Transformers.js source to confirm the exact URLs fetched during model load.
// The best approach is to:
//   1. Load the model once in dev tools with the Network tab open
//   2. Copy the exact URLs that were fetched
//   3. Use those URLs in this pre-cache list

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('transformers-cache').then((cache) => {
      // Use cache.addAll or fetch each individually with progress tracking
      return Promise.all(
        MOONSHINE_MODEL_FILES.map(url =>
          fetch(url).then(response => cache.put(url, response))
        )
      );
    })
  );
});
```

The ideal time to trigger this is right after the user's first meaningful interaction — e.g., after onboarding, after first page load settles, or during any idle moment. Do NOT block initial page load with this.

---

## Step 6: Fallback UI

When the 5-second timeout fires, display a message and text input. Suggested UX:

```
┌─────────────────────────────────────────┐
│  🔇  Your connection seems slow —       │
│       please type your message instead. │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ Type here...                    │    │
│  └─────────────────────────────────┘    │
│                            [Send]       │
│                                         │
│  (Speech recognition will be available  │
│   on your next visit.)                  │
└─────────────────────────────────────────┘
```

Key UX details:
- The message should be friendly and blame the connection, not the user.
- Show the text input immediately — don't make them tap again.
- The note about "next visit" is because the model continues loading in the background and will be cached.
- If the model finishes loading while they're still on the page, you can optionally show a subtle "Voice input is now available" indicator.

---

## Summary

| Layer | Technology | When Used |
|---|---|---|
| **Primary (non-iOS)** | Web Speech API | Android Chrome, Desktop Chrome/Edge |
| **Primary (iOS)** | Moonshine Tiny via Transformers.js v3 | All iOS browsers (Safari, Chrome, etc.) |
| **Background optimization** | Service Worker pre-cache | First visit, loads model files silently |
| **Fallback** | Text input | Model not cached + slow connection (>5s) |

## Key Links

- **Official Moonshine Web Example (React + Vite):** https://github.com/huggingface/transformers.js-examples/tree/main/moonshine-web
- **Moonshine Tiny ONNX Model:** https://huggingface.co/onnx-community/moonshine-tiny-ONNX
- **Transformers.js v3 Docs:** https://huggingface.co/docs/transformers.js/en/index
- **Transformers.js v3.2.0 Release (Moonshine support added):** https://github.com/huggingface/transformers.js/releases/tag/3.2.0
- **Moonshine Paper:** https://arxiv.org/abs/2410.15608
- **Web Speech API Spec:** https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API
- **Speech Recognition Browser Support:** https://caniuse.com/speech-recognition
