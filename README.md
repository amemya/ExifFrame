# ExifFrame

*[日本語の README はこちら](README_ja.md)*

ExifFrame is a cross-platform desktop application built to view and automatically extract EXIF metadata from your photographs, presenting it in a clean, professional, Lightroom-style dark workspace.

## Features

- **Professional UI**: A sleek, dark-themed interface inspired by modern photo editing tools (like Adobe Lightroom).
- **Native OS Integration**: Features a frameless, drag-enabled title bar for a fully native feel on both macOS and Windows.
- **EXIF Extraction**: Automatically reads Camera Model, Lens, Focal Length, Aperture, Shutter Speed, and ISO from your images.
- **XMP Fallback**: Supports reading metadata directly from Adobe XMP tags, ensuring compatibility with photos exported from Lightroom or Photoshop.
- **Export Capabilities**: Easy-to-use export functionality to save your formatted photos.

## Tech Stack

- **Backend**: [Go](https://golang.org/) & [Wails v2](https://wails.io/)
- **Frontend**: [React](https://reactjs.org/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/)
- **EXIF Parsing**: [goexif](https://github.com/rwcarlsen/goexif)

## Prerequisites

To build and run this application locally, you will need:

1. [Go 1.18+](https://golang.org/doc/install)
2. [Node.js 16+](https://nodejs.org/en/download/)
3. [Wails CLI](https://wails.io/docs/gettingstarted/installation)

## Getting Started

### Development

To run the application in live development mode (with hot-reloading for the frontend):

```bash
wails dev
```

### Build

To build a standalone executable for your operating system:

```bash
wails build
```

The compiled application will be available in the `build/bin/` directory.

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.
