# ─────────────────────────────────────────────────────────────────────────────
# Mask-to-Face Mapping — project Grounded SAM masks onto mesh faces
# ─────────────────────────────────────────────────────────────────────────────
# Merges segmentation masks from multiple views into per-face labels.
# Handles: overlapping masks, unlabeled faces, symmetric part cloning.
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import numpy as np
import structlog
from scipy.spatial import KDTree

logger = structlog.get_logger(__name__)


def map_masks_to_faces(
    views: list[tuple[dict[str, np.ndarray], np.ndarray]],
    mesh_face_centroids: np.ndarray,
    part_names: list[str] | None = None,
) -> np.ndarray:
    """Map pixel-level part masks from multiple views to mesh face labels.

    Merges masks across views — a face is labeled if ANY view's mask
    covers it. For conflicts (same face, different labels across views),
    the smallest-area mask wins (most specific part).

    Args:
        views: List of (masks_dict, face_id_map) tuples, one per view.
            masks_dict: Part name → binary mask (H, W).
            face_id_map: (H, W) array, each pixel = face index (-1 = bg).
        mesh_face_centroids: (num_faces, 3) face centroids for NN fallback.
        part_names: Optional list of all expected part names (for symmetric
            part heuristic).

    Returns:
        face_labels: (num_faces,) array, each entry is a part index (0, 1, 2...).

    Edge case handling:
        - Overlapping masks: smallest-area mask wins (more specific part).
        - Multi-view conflicts: smallest-area mask wins across all views.
        - Unlabeled faces: nearest-neighbor fill via KDTree.
        - No masks match: all faces assigned to part 0.
    """
    num_faces = len(mesh_face_centroids)
    face_labels = np.full(num_faces, -1, dtype=np.int32)

    # Collect all (part_name, mask, face_id_map, mask_area) across views
    all_mask_entries: list[tuple[str, np.ndarray, np.ndarray, int]] = []

    for masks_dict, face_id_map in views:
        for part_name, mask in masks_dict.items():
            area = int(mask.sum())
            all_mask_entries.append((part_name, mask, face_id_map, area))

    if not all_mask_entries:
        logger.warning("mask_to_faces_no_masks", num_faces=num_faces)
        face_labels[:] = 0
        return face_labels

    # Build part name → index mapping
    unique_parts = []
    part_to_idx: dict[str, int] = {}
    for part_name, _, _, _ in all_mask_entries:
        if part_name not in part_to_idx:
            part_to_idx[part_name] = len(unique_parts)
            unique_parts.append(part_name)

    # Sort by area (smallest first = most specific wins)
    sorted_entries = sorted(all_mask_entries, key=lambda e: e[3])

    # Track which mask size labeled each face (for conflict resolution)
    face_mask_area = np.full(num_faces, np.inf)

    for part_name, mask, face_id_map, area in sorted_entries:
        part_idx = part_to_idx[part_name]

        # Find face indices visible where this mask is True
        face_indices = face_id_map[mask]
        face_indices = face_indices[face_indices >= 0]  # Remove background
        face_indices = np.unique(face_indices)

        # Only overwrite if this mask is smaller (more specific)
        for fidx in face_indices:
            if fidx < num_faces and area < face_mask_area[fidx]:
                face_labels[fidx] = part_idx
                face_mask_area[fidx] = area

    # ── Symmetric part heuristic ─────────────────────────────────────────
    # If paired parts exist (e.g. front_left_leg / front_right_leg) and
    # one has zero labeled faces, clone labels from the visible one using
    # X-axis reflection.
    if part_names:
        _apply_symmetric_heuristic(
            face_labels, mesh_face_centroids, part_to_idx, part_names, num_faces
        )

    # ── Fill unlabeled faces via nearest-neighbor ────────────────────────
    unlabeled = face_labels == -1
    labeled = ~unlabeled

    if unlabeled.any() and labeled.any():
        labeled_centroids = mesh_face_centroids[labeled]
        labeled_ids = face_labels[labeled]
        tree = KDTree(labeled_centroids)
        _, nearest_idx = tree.query(mesh_face_centroids[unlabeled])
        face_labels[unlabeled] = labeled_ids[nearest_idx]
    elif unlabeled.all():
        logger.warning("mask_to_faces_all_unlabeled", num_faces=num_faces)
        face_labels[:] = 0

    labeled_count = int((face_labels >= 0).sum())
    logger.info(
        "mask_to_faces_complete",
        total_faces=num_faces,
        directly_labeled=labeled_count,
        parts_found=len(unique_parts),
    )

    return face_labels


# ── Symmetric pairs ──────────────────────────────────────────────────────────

_SYMMETRIC_SUFFIXES = [
    ("_left_", "_right_"),
    ("left_", "right_"),
    ("_left", "_right"),
]


def _find_symmetric_pair(name: str, all_names: list[str]) -> str | None:
    """Find the symmetric counterpart of a part name, if any."""
    for left_s, right_s in _SYMMETRIC_SUFFIXES:
        if left_s in name:
            pair = name.replace(left_s, right_s)
            if pair in all_names:
                return pair
        elif right_s in name:
            pair = name.replace(right_s, left_s)
            if pair in all_names:
                return pair
    return None


def _apply_symmetric_heuristic(
    face_labels: np.ndarray,
    centroids: np.ndarray,
    part_to_idx: dict[str, int],
    part_names: list[str],
    num_faces: int,
) -> None:
    """Clone labels from visible symmetric parts to occluded ones.

    If one side has labeled faces and the other has none, mirror the
    labels using X-axis reflection of face centroids.
    """
    checked: set[str] = set()

    for name in part_names:
        if name in checked or name not in part_to_idx:
            continue

        pair = _find_symmetric_pair(name, part_names)
        if pair is None or pair not in part_to_idx:
            continue

        checked.add(name)
        checked.add(pair)

        idx_a = part_to_idx[name]
        idx_b = part_to_idx[pair]

        count_a = int((face_labels == idx_a).sum())
        count_b = int((face_labels == idx_b).sum())

        # Only clone if one side is completely unlabeled
        if count_a > 0 and count_b == 0:
            _clone_via_reflection(face_labels, centroids, idx_a, idx_b, num_faces)
            logger.debug("symmetric_clone", source=name, target=pair)
        elif count_b > 0 and count_a == 0:
            _clone_via_reflection(face_labels, centroids, idx_b, idx_a, num_faces)
            logger.debug("symmetric_clone", source=pair, target=name)


def _clone_via_reflection(
    face_labels: np.ndarray,
    centroids: np.ndarray,
    source_idx: int,
    target_idx: int,
    num_faces: int,
) -> None:
    """Clone face labels from source to target using X-axis mesh reflection."""
    source_faces = np.where(face_labels == source_idx)[0]
    if len(source_faces) == 0:
        return

    # Reflect source centroids across X=0 plane
    source_centroids = centroids[source_faces].copy()
    source_centroids[:, 0] *= -1  # Mirror X axis

    # Find unlabeled faces near the reflected positions
    unlabeled_mask = face_labels == -1
    if not unlabeled_mask.any():
        return

    unlabeled_indices = np.where(unlabeled_mask)[0]
    unlabeled_centroids = centroids[unlabeled_indices]

    tree = KDTree(unlabeled_centroids)

    # For each reflected source centroid, find nearest unlabeled face
    distances, nearest = tree.query(source_centroids)

    # Only assign if distance is reasonable (< 0.3 units)
    for dist, nn_idx in zip(distances, nearest):
        if dist < 0.3:
            face_labels[unlabeled_indices[nn_idx]] = target_idx
