#!/usr/bin/env python3
import argparse
from pathlib import Path

from PIL import Image, ImageDraw


def main():
    parser = argparse.ArgumentParser(description="Create source-bound BEFORE/AFTER parameter-fit evidence.")
    parser.add_argument("--reference", required=True)
    parser.add_argument("--before", required=True)
    parser.add_argument("--after", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    images = [Image.open(value).convert("RGB") for value in [args.reference, args.before, args.after]]
    width = max(image.width for image in images)
    height = max(image.height for image in images)
    board = Image.new("RGB", (width * 3, height + 28), "white")
    draw = ImageDraw.Draw(board)
    for index, (label, image) in enumerate(zip(["REFERENCE", "BEFORE", "AFTER"], images)):
        board.paste(image, (index * width, 28))
        draw.text((index * width + 6, 7), label, fill=(20, 20, 20))
    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    board.save(output)


if __name__ == "__main__":
    main()
