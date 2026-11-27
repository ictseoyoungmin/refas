#!/usr/bin/env python3
"""Pure image/ROI helpers shared by source-bound observation extraction."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def digest_json(value) -> str:
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()

def roi_pixels(roi,width:int,height:int):
    if not isinstance(roi,list) or len(roi)!=4:
        raise ValueError('ROI must be normalized [x,y,width,height]')
    x,y,w,h=map(float,roi)
    if x<0 or y<0 or w<=0 or h<=0 or x+w>1 or y+h>1:
        raise ValueError('ROI must lie within [0,1]')
    return (round(x*width),round(y*height),round((x+w)*width),round((y+h)*height))

def normalize_uint8(array:np.ndarray)->np.ndarray:
    array=np.nan_to_num(array.astype(np.float32))
    lo,hi=float(np.percentile(array,1)),float(np.percentile(array,99))
    if hi<=lo+1e-8:
        return np.zeros(array.shape,dtype=np.uint8)
    return np.clip((array-lo)/(hi-lo)*255.0,0,255).astype(np.uint8)

def font(size:int):
    for candidate in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf'):
        if Path(candidate).is_file():
            return ImageFont.truetype(candidate,size)
    return ImageFont.load_default()

def make_board(items,output:Path):
    cell_w,cell_h,header=420,360,42
    columns=3
    rows=(len(items)+columns-1)//columns
    board=Image.new('RGB',(columns*cell_w,rows*(cell_h+header)),(14,17,21))
    draw=ImageDraw.Draw(board)
    for index,(label,image) in enumerate(items):
        column,row=index%columns,index//columns
        x,y=column*cell_w,row*(cell_h+header)
        fitted=ImageOps.contain(image.convert('RGB'),(cell_w-20,cell_h-20),Image.Resampling.LANCZOS)
        board.paste(fitted,(x+(cell_w-fitted.width)//2,y+header+(cell_h-fitted.height)//2))
        draw.text((x+12,y+10),label,fill=(235,240,246),font=font(18))
    board.save(output,format='PNG')
