# ─────────────────────────────────────────────────────────────────────────────
# Mesh Renderer — multi-view color + face-ID pass for segmentation
# ─────────────────────────────────────────────────────────────────────────────
# Renders the Hunyuan3D output mesh from multiple canonical views.
# Each view produces:
#   - color_image: PIL Image fed to Grounded SAM 2
#   - face_id_map: (H, W) int array mapping pixels to mesh face indices
#
# Uses pyrender with OSMesa backend (PYOPENGL_PLATFORM=osmesa) for reliable
# headless rendering. Only needs GPU for ML inference, not for rendering.
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import math
from typing import Any

import numpy as np
import PIL.Image
import structlog
import trimesh

logger = structlog.get_logger(__name__)

# ── Camera positions for canonical views ─────────────────────────────────────
# Multiple views avoid single-view occlusion (e.g. far legs hidden behind near
# legs on a quadruped). Each view is defined as (eye_x, eye_y, eye_z).
_VIEW_CONFIGS = {
    "side": {"eye": (2.5, 0.5, 0.0), "up": (0, 1, 0)},
    "front": {"eye": (0.0, 0.5, 2.5), "up": (0, 1, 0)},
    "three_quarter": {"eye": (1.8, 0.8, 1.8), "up": (0, 1, 0)},
}


def _look_at(
    eye: tuple[float, ...],
    target: tuple[float, ...] = (0, 0, 0),
    up: tuple[float, ...] = (0, 1, 0),
) -> np.ndarray[Any, Any]:
    """Compute a 4x4 camera-to-world transform (look-at matrix)."""
    eye_arr = np.array(eye, dtype=np.float64)
    target_arr = np.array(target, dtype=np.float64)
    up_arr = np.array(up, dtype=np.float64)

    forward = target_arr - eye_arr
    forward /= np.linalg.norm(forward)
    right = np.cross(forward, up_arr)
    right /= np.linalg.norm(right)
    true_up = np.cross(right, forward)

    mat = np.eye(4)
    mat[:3, 0] = right
    mat[:3, 1] = true_up
    mat[:3, 2] = -forward
    mat[:3, 3] = eye_arr
    return mat


def _encode_face_id(face_idx: int) -> tuple[int, int, int]:
    """Encode a face index as an RGB color (24-bit, up to 16M faces)."""
    r = (face_idx >> 16) & 0xFF
    g = (face_idx >> 8) & 0xFF
    b = face_idx & 0xFF
    return (r, g, b)


def _decode_face_id(r: int, g: int, b: int) -> int:
    """Decode an RGB color back to a face index."""
    return (r << 16) | (g << 8) | b


def render_multiview_with_id_pass(
    mesh: trimesh.Trimesh,
    resolution: int = 512,
    views: list[str] | None = None,
) -> list[tuple[PIL.Image.Image, np.ndarray]]:
    """Render mesh from multiple canonical views + face-ID passes.

    Each view produces a color image for segmentation and a face-ID map
    that links pixels to mesh faces. Multi-view avoids occlusion issues.

    Args:
        mesh: Triangle mesh to render.
        resolution: Output image size (square).
        views: List of view names. Defaults to ["side", "front", "three_quarter"].

    Returns:
        List of (color_image, face_id_map) tuples, one per view.
        face_id_map: (resolution, resolution) int array. -1 = background.
    """
    import time

    import pyrender  # type: ignore[import-untyped]

    if views is None:
        views = ["side", "front", "three_quarter"]

    t0 = time.perf_counter()

    # Center and scale mesh to fit in view
    centered_mesh = mesh.copy()
    centered_mesh.vertices -= centered_mesh.centroid
    scale = 1.0 / max(centered_mesh.extents)
    centered_mesh.vertices *= scale

    results: list[tuple[PIL.Image.Image, np.ndarray]] = []

    for view_name in views:
        config = _VIEW_CONFIGS.get(view_name, _VIEW_CONFIGS["side"])

        # ── Color pass ───────────────────────────────────────────────────
        color_image = _render_color_pass(centered_mesh, config, resolution, pyrender)

        # ── Face-ID pass ─────────────────────────────────────────────────
        # Each face gets a unique color. No anti-aliasing, no alpha blending,
        # GL_NEAREST filtering to prevent color interpolation at edges.
        face_id_map = _render_id_pass(centered_mesh, config, resolution, pyrender)

        results.append((color_image, face_id_map))

    elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)
    logger.info(
        "mesh_rendered",
        views=len(results),
        resolution=resolution,
        faces=len(mesh.faces),
        time_ms=elapsed_ms,
    )

    return results


def _render_color_pass(
    mesh: trimesh.Trimesh,
    config: dict[str, Any],
    resolution: int,
    pyrender: Any,
) -> PIL.Image.Image:
    """Render a color pass of the mesh from the given viewpoint."""
    scene = pyrender.Scene(bg_color=[0, 0, 0, 0])

    # Add mesh with default material
    py_mesh = pyrender.Mesh.from_trimesh(mesh)
    scene.add(py_mesh)

    # Add camera
    camera = pyrender.PerspectiveCamera(yfov=math.pi / 4.0)
    camera_pose = _look_at(config["eye"], up=config["up"])
    scene.add(camera, pose=camera_pose)

    # Add light
    light = pyrender.DirectionalLight(color=[1.0, 1.0, 1.0], intensity=3.0)
    scene.add(light, pose=camera_pose)

    # Render
    renderer = pyrender.OffscreenRenderer(resolution, resolution)
    color, _ = renderer.render(scene)
    renderer.delete()

    return PIL.Image.fromarray(color)


def _render_id_pass(
    mesh: trimesh.Trimesh,
    config: dict[str, Any],
    resolution: int,
    pyrender: Any,
) -> np.ndarray[Any, Any]:
    """Render a face-ID pass — each face has a unique color.

    ID pass configuration:
    - GL_NEAREST filtering (no color interpolation)
    - No MSAA / anti-aliasing
    - No alpha blending
    - Flat shading (no lighting applied)
    """
    num_faces = len(mesh.faces)

    # Assign each face a unique color
    face_colors = np.zeros((num_faces, 4), dtype=np.uint8)
    for i in range(num_faces):
        r, g, b = _encode_face_id(i)
        face_colors[i] = [r, g, b, 255]

    # Create a copy with per-face vertex colors
    # Expand to per-vertex by duplicating vertices for each face
    id_mesh = mesh.copy()
    id_mesh.visual = trimesh.visual.ColorVisuals(mesh=id_mesh, face_colors=face_colors)

    scene = pyrender.Scene(
        bg_color=[0, 0, 0, 0],
        ambient_light=[1.0, 1.0, 1.0],  # Full ambient = no shading variation
    )

    # Flat material — no lighting effects
    material = pyrender.MetallicRoughnessMaterial(
        metallicFactor=0.0,
        roughnessFactor=1.0,
        alphaMode="OPAQUE",
    )
    py_mesh = pyrender.Mesh.from_trimesh(id_mesh, material=material, smooth=False)
    scene.add(py_mesh)

    camera = pyrender.PerspectiveCamera(yfov=math.pi / 4.0)
    camera_pose = _look_at(config["eye"], up=config["up"])
    scene.add(camera, pose=camera_pose)

    # Render with no anti-aliasing
    renderer = pyrender.OffscreenRenderer(resolution, resolution)
    color, _ = renderer.render(
        scene,
        flags=pyrender.constants.RenderFlags.FLAT | pyrender.constants.RenderFlags.SKIP_CULL_FACES,
    )
    renderer.delete()

    # Decode pixel colors back to face indices
    face_id_map = np.full((resolution, resolution), -1, dtype=np.int32)

    r = color[:, :, 0].astype(np.int32)
    g = color[:, :, 1].astype(np.int32)
    b = color[:, :, 2].astype(np.int32)

    decoded = (r << 16) | (g << 8) | b

    # Background pixels (black) map to face 0 — mark as -1
    non_background = decoded > 0
    face_id_map[non_background] = decoded[non_background]

    # Clamp to valid face indices
    face_id_map[face_id_map >= num_faces] = -1

    return face_id_map
