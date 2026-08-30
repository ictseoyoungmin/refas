#!/usr/bin/env python3
import argparse
from pathlib import Path
from PIL import Image, ImageDraw

def contain(image, size, background):
    image = image.convert('RGB')
    scale = min(size[0] / image.width, size[1] / image.height)
    image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    canvas = Image.new('RGB', size, background)
    canvas.paste(image, ((size[0] - image.width) // 2, (size[1] - image.height) // 2))
    return canvas

def main():
    parser = argparse.ArgumentParser(description='Create a source-versus-current whole-shape comparison.')
    parser.add_argument('--source', required=True); parser.add_argument('--render', required=True); parser.add_argument('--out', required=True)
    args = parser.parse_args(); panel_size = (520, 620)
    source = contain(Image.open(args.source), panel_size, (247, 246, 243))
    render = contain(Image.open(args.render), panel_size, (12, 16, 20))
    board = Image.new('RGB', (panel_size[0] * 2, panel_size[1] + 42), (12, 16, 20))
    board.paste(source, (0, 42)); board.paste(render, (panel_size[0], 42)); draw = ImageDraw.Draw(board)
    draw.text((14, 13), 'RAW SOURCE - PRIMARY EVIDENCE', fill=(236, 238, 240))
    draw.text((panel_size[0] + 14, 13), 'CURRENT GLB - HERO', fill=(236, 238, 240))
    output = Path(args.out); output.parent.mkdir(parents=True, exist_ok=True); board.save(output)

if __name__ == '__main__': main()
