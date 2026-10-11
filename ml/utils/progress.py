def progress(it, **kw):
    try:
        from tqdm import tqdm
        return tqdm(it, **kw)
    except ImportError:
        return it
