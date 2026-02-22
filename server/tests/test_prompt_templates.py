# ─────────────────────────────────────────────────────────────────────────────
# Tests — Prompt Templates
# ─────────────────────────────────────────────────────────────────────────────

from app.pipeline.prompt_templates import get_canonical_prompt


class TestGetCanonicalPrompt:
    """Tests for get_canonical_prompt()."""

    def test_base_prompt_contains_noun(self):
        result = get_canonical_prompt("horse", "quadruped")
        assert "horse" in result

    def test_base_prompt_has_required_elements(self):
        result = get_canonical_prompt("horse", "quadruped")
        assert "3D render" in result
        assert "side view" in result
        assert "white background" in result
        assert "centered" in result
        assert "studio lighting" in result

    def test_quadruped_suffix(self):
        result = get_canonical_prompt("dog", "quadruped")
        assert "four legs visible" in result
        assert "standing pose" in result

    def test_biped_suffix(self):
        result = get_canonical_prompt("person", "biped")
        assert "T-pose" in result
        assert "symmetrical" in result

    def test_bird_suffix(self):
        result = get_canonical_prompt("eagle", "bird")
        assert "wings slightly spread" in result

    def test_fish_suffix(self):
        result = get_canonical_prompt("shark", "fish")
        assert "swimming pose" in result

    def test_vehicle_suffix(self):
        result = get_canonical_prompt("car", "vehicle")
        assert "three-quarter view" in result

    def test_aircraft_suffix(self):
        result = get_canonical_prompt("airplane", "aircraft")
        assert "both wings visible" in result

    def test_furniture_suffix(self):
        result = get_canonical_prompt("chair", "furniture")
        assert "all legs visible" in result

    def test_plant_suffix(self):
        result = get_canonical_prompt("tree", "plant")
        assert "roots to canopy" in result

    def test_building_suffix(self):
        result = get_canonical_prompt("castle", "building")
        assert "front-facing" in result

    def test_insect_suffix(self):
        result = get_canonical_prompt("butterfly", "insect")
        assert "wings spread" in result

    def test_unknown_type_gets_base_only(self):
        result = get_canonical_prompt("blob", "default")
        assert "3D render of a blob" in result
        # No category-specific suffix
        assert "four legs" not in result
        assert "T-pose" not in result

    def test_different_nouns_produce_different_prompts(self):
        horse = get_canonical_prompt("horse", "quadruped")
        eagle = get_canonical_prompt("eagle", "bird")
        assert horse != eagle
