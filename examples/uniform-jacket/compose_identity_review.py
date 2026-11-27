#!/usr/bin/env python3
"""Assemble unchanged alpha renders on a neutral display background.

This is a presentation board, not a rerender or a source registration. The
original PNGs remain beside it and retain all their original pixels/alpha.
"""
import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,required=True)
    args=parser.parse_args();root=args.root
    font_path='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    heading=ImageFont.truetype(font_path,21);small=ImageFont.truetype(font_path,15)
    for name,view in [('whole','front-three-quarter'),('collar','fold-side'),('ornament','ornament')]:
        images=[Image.open(root/'renders'/stage/('view-'+view+'.png')).convert('RGBA') for stage in ['before','after']]
        assert images[0].size==images[1].size
        w,h=images[0].size;board=Image.new('RGB',(w*2,h+84),(238,240,244));draw=ImageDraw.Draw(board)
        draw.text((22,16),'Previous selected baseline',font=heading,fill=(27,33,43))
        draw.text((w+22,16),'Selected identity refinement',font=heading,fill=(27,33,43))
        for i,im in enumerate(images):board.paste(im,(i*w,48),im)
        draw.line((w,0,w,h+84),fill=(188,195,204),width=1)
        draw.text((22,h+58),'Actual fixed-view renders. Camera, lights, size and samples match; source view is unregistered.',font=small,fill=(58,65,77))
        board.save(root/('comparison-'+name+'.png'))


if __name__=='__main__':
    main()
