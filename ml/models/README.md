# M1 DETECT — trained segmentation model slot

`app/detection/segmentation.py` currently ships only the deterministic CFAR
baseline. No trained weights are included in this repository: a real
oil-spill segmentation model needs a labeled SAR dataset (e.g. a
CleanSeaNet-style archive) and GPU training time, neither of which this
sandbox has network or hardware access to.

To plug a trained model in later, implement a function with this exact
signature and it can replace or ensemble with `cfar_dark_spots_fast`
without touching anything in `postprocessing.py` or
`slick_characterization.py` — both only consume the binary mask, not how
it was produced:

```python
def model_dark_spots(sigma0_db: np.ndarray, valid_mask: np.ndarray) -> np.ndarray:
    """Returns a boolean array, same shape as sigma0_db, True = candidate dark spot."""
```

Expected checkpoint format: a PyTorch `state_dict` for either a U-Net or
DeepLabV3+ (both are listed in requirements.txt via `torch`/`torchvision`),
single-channel input (calibrated sigma0 dB, normalized), single-channel
sigmoid output thresholded at 0.5. Store checkpoints under
`ml/models/<name>/<version>/model.pt` with a sibling `metadata.json`
recording training dataset, date, and validation metrics — this is what
`SpillDetection.model_version` in the DB schema is meant to reference.
