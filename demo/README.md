# Image Comparison Tool

A modern, refactored image comparison tool that uses the [pixelmatch](https://github.com/mapbox/pixelmatch) library to detect differences between images.

## Features

- **Drag & Drop Interface**: Easy image upload with visual feedback
- **Real-time Comparison**: Automatic comparison when both images are loaded
- **Configurable Options**: Adjustable threshold, dimensions, and color settings
- **Visual Difference Display**: Clear visualization of pixel differences
- **Download Results**: Save difference images for further analysis
- **Responsive Design**: Works on desktop and mobile devices
- **Keyboard Shortcuts**: Quick access to options (Ctrl/Cmd + O)

## File Structure

```
tools/image_compare/
├── index.html          # Main HTML structure
├── styles.css          # Separated CSS styles
├── app.js             # Modular JavaScript application
└── README.md          # This documentation
```

## Architecture

The refactored code follows modern JavaScript best practices:

### 1. **Configuration (`CONFIG`)**

- Centralized default options and result categories
- Easy to modify thresholds and settings

### 2. **Utility Class (`Utils`)**

- Static helper methods for common operations
- Image loading, scaling, and color conversion
- Result categorization logic

### 3. **Options Manager (`OptionsManager`)**

- Handles all comparison option controls
- Event binding and value synchronization
- Reset functionality with defaults

### 4. **Image Display Manager (`ImageDisplayManager`)**

- Manages image display and drag & drop
- Handles file input changes
- Renders comparison results and diff images

### 5. **Main Application (`ImageCompareApp`)**

- Orchestrates all components
- Manages application state
- Handles user interactions and comparisons

## Usage

### Basic Comparison

1. Drag and drop two images into the designated areas
2. The tool automatically compares them using default settings
3. View the difference visualization and analysis results

### Advanced Options

- **Max Dimension**: Control image resolution (64-512px)
- **Threshold**: Adjust sensitivity (0-1)
- **Anti-aliasing**: Detect anti-aliased pixels
- **Alpha Blending**: Control background blending
- **Colors**: Customize difference visualization colors
- **Diff Mask**: Enable transparent backgrounds

### Persistence

- **Automatic Caching**: All option changes are automatically saved to localStorage
- **Session Persistence**: Your settings are remembered between browser sessions
- **Cache Management**: Use "Clear Cache" button to reset to defaults and clear stored settings

### Controls

- **Compare Images**: Run the comparison with current settings
- **Clear Images**: Remove all loaded images and results
- **Reset Options**: Reset all options to default values
- **Clear Cache**: Clear localStorage cache and reset to defaults

### Keyboard Shortcuts

- `Ctrl/Cmd + O`: Toggle options panel

## Technical Improvements

### Code Organization

- **Separation of Concerns**: HTML, CSS, and JavaScript are now separate
- **Modular Classes**: Each class has a single responsibility
- **Configuration Constants**: Easy to modify settings in one place

### Maintainability

- **Clean Structure**: Logical grouping of related functionality
- **Consistent Naming**: Clear, descriptive method and variable names
- **Error Handling**: Proper error handling with user feedback
- **Documentation**: Inline comments explaining complex logic

### Performance

- **Efficient Event Handling**: Optimized event listeners
- **Async Operations**: Non-blocking image processing
- **Memory Management**: Proper cleanup of resources
- **Local Storage**: Persistent option caching for better user experience

### User Experience

- **Responsive Design**: Mobile-friendly layout
- **Visual Feedback**: Clear indication of application state
- **Accessibility**: Proper ARIA labels and keyboard navigation

## Browser Compatibility

- Modern browsers with ES6+ support
- Canvas API support required
- File API support for drag & drop

## Dependencies

- **pixelmatch**: Image comparison algorithm (loaded from CDN)
- **No build tools required**: Pure HTML, CSS, and JavaScript

## Future Enhancements

- **Batch Processing**: Compare multiple image pairs
- **Export Options**: Various output formats
- **Advanced Filters**: Custom comparison algorithms
- **History**: Save comparison results
- **API Integration**: Server-side processing for large images

## Contributing

The modular structure makes it easy to:

- Add new comparison options
- Implement additional visualization methods
- Extend the UI with new features
- Optimize performance in specific areas

## License

Initial Author: [HoangTran0410](https://github.com/HoangTran0410)
