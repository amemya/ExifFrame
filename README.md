# ExifFrame

[![CI](https://github.com/amemya/ExifFrame/actions/workflows/ci.yml/badge.svg)](https://github.com/amemya/ExifFrame/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/amemya/ExifFrame/branch/main/graph/badge.svg)](https://codecov.io/gh/amemya/ExifFrame)
[![Release](https://img.shields.io/github/v/release/amemya/ExifFrame)](https://github.com/amemya/ExifFrame/releases)
[![Go Version](https://img.shields.io/github/go-mod/go-version/amemya/ExifFrame)](https://github.com/amemya/ExifFrame)
[![Wails](https://img.shields.io/badge/Wails-v3-red.svg)](https://v3alpha.wails.io/)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)]()

*[日本語の README はこちら](README_ja.md)*

ExifFrame is a cross-platform desktop application that reads EXIF/XMP metadata from your photos and generates beautiful, framed images containing your shooting information (Camera, Lens, Aperture, Shutter Speed, ISO, etc.). 

It is perfect for sharing your photography settings stylishly on social media or in your portfolio.

## Key Features

- **Beautiful Frame Generation**:
  - Automatically adds a custom frame/border to your photos with shooting metadata neatly formatted at the bottom.
  - Fully customizable: aspect ratio presets (1:1, 4:5, 16:9, etc.), custom ratios, frame colors, text colors, and alignments.
  - Supports system fonts, allowing you to match the text style to your personal branding.

- **Automated Metadata Extraction**:
  - Reads Camera Model, Lens, Focal Length, Aperture, Shutter Speed, and ISO instantly.
  - **Adobe XMP Fallback**: Seamlessly recovers metadata from Adobe XMP tags if standard EXIF data is missing (e.g., after exporting from Lightroom or Photoshop).

- **Batch Processing & Watch Folder**:
  - Load multiple files or entire folders to apply frames and export them all at once.
  - **Watch Folder**: Set up a designated folder to automatically process and frame any new photos dropped into it in the background.

- **Advanced Customization & Presets**:
  - **Analog Film Data Support**: In addition to digital camera settings, you can display analog film details such as Film Stock, Developer, Dilution, Temperature, and Development Time. You can easily pull these settings from the built-in "Film Recipes" database.
  - Save your favorite configurations as the "Auto-Export Default" for instant, one-click processing in the future.

- **Modern Tech Stack**:
  - Built with **Go** & **Wails v3** for a fast, lightweight backend experience.
  - Features a highly responsive frontend powered by **React, TypeScript, and Vite**.

## Setup & Build Instructions

### Prerequisites
- [Go 1.25+](https://golang.org/doc/install)
- [Node.js 20+](https://nodejs.org/en/download/)
- [Wails v3 CLI](https://v3alpha.wails.io/)

### Development Mode
To run the application with live-reloading (hot reload) for the frontend:
```bash
wails3 dev
```

### Build
To build a standalone executable for your operating system:
```bash
wails3 build
```
Compiled binaries will be generated in the `build/bin/` directory.

## Contributing
Pull requests and issues are welcome! For major changes or new features, please open an issue first to discuss your ideas.
