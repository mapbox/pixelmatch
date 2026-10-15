import pixelmatch from 'https://unpkg.com/pixelmatch';

// Configuration constants
const CONFIG = {
    STORAGE_KEY: 'imageCompareOptions',
    DEFAULT_OPTIONS: {
        maxDim: 128,
        threshold: 0.3,
        includeAA: false,
        alpha: 0.1,
        aaColor: '#ffff00',
        diffColor: '#ff0000',
        diffColorAlt: '#00ff00',
        diffMask: false
    },
    RESULT_CATEGORIES: {
        VERY_SIMILAR: {
            threshold: 20,
            color: '#28a745',
            icon: '✅',
            description: 'Images are nearly identical'
        },
        SIMILAR: {
            threshold: 40,
            color: '#17a2b8',
            icon: '🔍',
            description: 'Images are very similar'
        },
        SOMEWHAT_DIFFERENT: {
            threshold: 60,
            color: '#ffc107',
            icon: '⚠️',
            description: 'Images have noticeable differences'
        },
        VERY_DIFFERENT: {
            threshold: Infinity,
            color: '#dc3545',
            icon: '❌',
            description: 'Images are significantly different'
        }
    }
};

// Utility functions
class Utils {
    static hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
            ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
            : [255, 255, 255];
    }

    static async loadImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    }

    static drawScaled(img, width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        return ctx.getImageData(0, 0, width, height);
    }

    static getResultCategory(diffPercent) {
        for (const [category, config] of Object.entries(CONFIG.RESULT_CATEGORIES)) {
            if (diffPercent < config.threshold) {
                return { category, ...config };
            }
        }
        return CONFIG.RESULT_CATEGORIES.VERY_DIFFERENT;
    }

    static saveToLocalStorage(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (error) {
            console.warn('Failed to save to localStorage:', error);
        }
    }

    static loadFromLocalStorage(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.warn('Failed to load from localStorage:', error);
            return defaultValue;
        }
    }
}

// Options management
class OptionsManager {
    constructor() {
        this.elements = this.initializeElements();
        this.initializeValues(true);
        this.bindEvents();
    }

    initializeElements() {
        return {
            maxDim: document.getElementById('maxDim'),
            maxDimValue: document.getElementById('maxDim-value'),
            threshold: document.getElementById('threshold'),
            thresholdValue: document.getElementById('threshold-value'),
            includeAA: document.getElementById('includeAA'),
            alpha: document.getElementById('alpha'),
            alphaValue: document.getElementById('alpha-value'),
            aaColor: document.getElementById('aaColor'),
            diffColor: document.getElementById('diffColor'),
            diffColorAlt: document.getElementById('diffColorAlt'),
            diffMask: document.getElementById('diffMask')
        };
    }

    initializeValues(fromCache = false) {
        // Load cached values or use defaults
        const cachedOptions = fromCache
            ? Utils.loadFromLocalStorage(CONFIG.STORAGE_KEY, CONFIG.DEFAULT_OPTIONS)
            : {};
        const options = { ...CONFIG.DEFAULT_OPTIONS, ...cachedOptions };

        // Set input values
        this.elements.maxDim.value = options.maxDim;
        this.elements.threshold.value = options.threshold;
        this.elements.includeAA.checked = options.includeAA;
        this.elements.alpha.value = options.alpha;
        this.elements.aaColor.value = options.aaColor;
        this.elements.diffColor.value = options.diffColor;
        this.elements.diffColorAlt.value = options.diffColorAlt;
        this.elements.diffMask.checked = options.diffMask;

        // Update display values
        this.elements.maxDimValue.textContent = options.maxDim;
        this.elements.thresholdValue.textContent = options.threshold;
        this.elements.alphaValue.textContent = options.alpha;
    }

    bindEvents() {
        // Update range value displays and save to localStorage
        this.elements.maxDim.addEventListener('input', e => {
            this.elements.maxDimValue.textContent = e.target.value;
            this.saveOptions();
            window.ImageCompareApp.autoCompare();
        });

        this.elements.threshold.addEventListener('input', e => {
            this.elements.thresholdValue.textContent = e.target.value;
            this.saveOptions();
            window.ImageCompareApp.autoCompare();
        });

        this.elements.alpha.addEventListener('input', e => {
            this.elements.alphaValue.textContent = e.target.value;
            this.saveOptions();
            window.ImageCompareApp.autoCompare();
        });

        // Auto-compare and save on option changes
        const autoCompareOptions = [
            'maxDim',
            'includeAA',
            'aaColor',
            'diffColor',
            'diffColorAlt',
            'diffMask'
        ];

        autoCompareOptions.forEach(option => {
            this.elements[option].addEventListener('change', () => {
                this.saveOptions();
                window.ImageCompareApp.autoCompare();
            });
        });
    }

    getOptions() {
        return {
            maxDim: parseInt(this.elements.maxDim.value),
            threshold: parseFloat(this.elements.threshold.value),
            includeAA: this.elements.includeAA.checked,
            alpha: parseFloat(this.elements.alpha.value),
            aaColor: Utils.hexToRgb(this.elements.aaColor.value),
            diffColor: Utils.hexToRgb(this.elements.diffColor.value),
            diffColorAlt: Utils.hexToRgb(this.elements.diffColorAlt.value),
            diffMask: this.elements.diffMask.checked
        };
    }

    saveOptions() {
        const options = {
            maxDim: parseInt(this.elements.maxDim.value),
            threshold: parseFloat(this.elements.threshold.value),
            includeAA: this.elements.includeAA.checked,
            alpha: parseFloat(this.elements.alpha.value),
            aaColor: this.elements.aaColor.value,
            diffColor: this.elements.diffColor.value,
            diffColorAlt: this.elements.diffColorAlt.value,
            diffMask: this.elements.diffMask.checked
        };

        Utils.saveToLocalStorage(CONFIG.STORAGE_KEY, options);
    }

    reset() {
        this.initializeValues(false);

        // Auto-compare if both images are present
        if (window.ImageCompareApp.hasBothImages()) {
            setTimeout(() => window.ImageCompareApp.autoCompare(), 100);
        }
    }
}

// Image display management
class ImageDisplayManager {
    constructor() {
        this.setupDragAndDrop();
        this.bindFileInputs();
    }

    setupDragAndDrop() {
        const display1 = document.getElementById('display1');
        const display2 = document.getElementById('display2');

        [display1, display2].forEach(display => {
            display.addEventListener('dragover', this.handleDragOver);
            display.addEventListener('dragleave', this.handleDragLeave);
            display.addEventListener('drop', this.handleDrop);
        });
    }

    bindFileInputs() {
        document.getElementById('file1').addEventListener('change', e => {
            if (e.target.files[0]) {
                window.ImageCompareApp.setImage1(e.target.files[0]);
            }
        });

        document.getElementById('file2').addEventListener('change', e => {
            if (e.target.files[0]) {
                window.ImageCompareApp.setImage2(e.target.files[0]);
            }
        });
    }

    handleDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('drag-over');
    }

    handleDragLeave(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
    }

    handleDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type.startsWith('image/')) {
            const file = files[0];
            const imageType = e.currentTarget.dataset.imageType;

            if (imageType === 'image1') {
                window.ImageCompareApp.setImage1(file);
            } else if (imageType === 'image2') {
                window.ImageCompareApp.setImage2(file);
            }
        }
    }

    displayImage(file, displayId) {
        const display = document.getElementById(displayId);
        const imageType = display.dataset.imageType;
        const fileId = imageType === 'image1' ? '1' : '2';

        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                display.innerHTML = `
                    <div class="image-container" onclick="document.getElementById('file${fileId}').click()">
                        <img src="${e.target.result}" alt="Selected image" />
                        <div class="image-overlay">
                            <p style="margin: 0; color: white; font-size: 12px; text-shadow: 1px 1px 2px rgba(0,0,0,0.8);">
                                Click to change image
                            </p>
                        </div>
                    </div>
                `;

                // Re-add the file input after setting innerHTML
                this.addFileInput(display, fileId, imageType);
            }.bind(this);
            reader.readAsDataURL(file);
        } else {
            const placeholderText =
                imageType === 'image1' ? 'Drop First Image Here' : 'Drop Second Image Here';

            display.innerHTML = `
                <div class="no-image" onclick="document.getElementById('file${fileId}').click()">
                    <div>
                        <p class="placeholder-text">${placeholderText}</p>
                        <p class="help-text">Drag and drop or click to select</p>
                    </div>
                </div>
            `;

            // Re-add the file input after setting innerHTML
            this.addFileInput(display, fileId, imageType);
        }
    }

    addFileInput(display, fileId, imageType) {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = `file${fileId}`;
        fileInput.accept = 'image/*';
        fileInput.className = 'file-input';
        fileInput.style.display = 'none';
        fileInput.addEventListener('change', function (e) {
            if (e.target.files && e.target.files[0]) {
                const file = e.target.files[0];
                if (imageType === 'image1') {
                    window.ImageCompareApp.setImage1(file);
                } else if (imageType === 'image2') {
                    window.ImageCompareApp.setImage2(file);
                }
            }
        });
        display.appendChild(fileInput);
    }

    renderDiffImage(diffData, width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Create ImageData from diff array
        const imageData = new ImageData(diffData, width, height);
        ctx.putImageData(imageData, 0, 0);

        // Convert canvas to data URL and display
        const diffDisplay = document.getElementById('diff-display');
        diffDisplay.innerHTML = `
            <div class="diff-image-container">
                <img src="${canvas.toDataURL()}" alt="Difference visualization" />
                <br/>
                <button onclick="window.ImageCompareApp.downloadDiffImage()" class="download-btn">
                    Download Diff Image
                </button>
            </div>
        `;

        // Store canvas reference for download
        diffDisplay.dataset.canvas = canvas;
    }

    renderResult(mismatched, totalPixels, diffPercent, resultConfig) {
        const resultDiv = document.getElementById('result');
        resultDiv.style.display = 'block';

        resultDiv.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; gap: 15px; margin-bottom: 15px;">
                <span style="font-size: 24px;">${resultConfig.icon}</span>
                <h3 style="margin: 0; color: ${resultConfig.color};">${resultConfig.category}</h3>
            </div>
            <div style="background: ${
                resultConfig.color
            }20; padding: 15px; border-radius: 8px; border-left: 4px solid ${resultConfig.color};">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; text-align: left;">
                    <div>
                        <strong style="color: ${resultConfig.color};">Pixel Analysis:</strong><br>
                        <span style="font-size: 18px; font-weight: bold;">${mismatched}</span> different pixels<br>
                        <span style="font-size: 18px; font-weight: bold;">${
                            totalPixels - mismatched
                        }</span> matching pixels<br>
                        <span style="font-size: 18px; font-weight: bold;">${totalPixels}</span> total pixels
                    </div>
                    <div>
                        <strong style="color: ${resultConfig.color};">Difference Level:</strong><br>
                        <span style="font-size: 24px; font-weight: bold; color: ${
                            resultConfig.color
                        };">${diffPercent.toFixed(2)}%</span><br>
                        <small style="color: #666;">
                            ${resultConfig.description}
                        </small>
                    </div>
                </div>
            </div>
        `;
    }
}

// Main application class
class ImageCompareApp {
    constructor() {
        this.image1File = null;
        this.image2File = null;
        this.optionsManager = new OptionsManager();
        this.imageDisplayManager = new ImageDisplayManager();
        this.bindEvents();
        this.setupKeyboardShortcuts();
    }

    bindEvents() {
        document
            .getElementById('reset-options')
            .addEventListener('click', () => this.optionsManager.reset());
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
                e.preventDefault();
                this.toggleOptions();
            }
        });
    }

    setImage1(file) {
        this.image1File = file;
        this.imageDisplayManager.displayImage(file, 'display1');
        if (this.hasBothImages()) {
            setTimeout(() => this.autoCompare(), 100);
        }
    }

    setImage2(file) {
        this.image2File = file;
        this.imageDisplayManager.displayImage(file, 'display2');
        if (this.hasBothImages()) {
            setTimeout(() => this.autoCompare(), 100);
        }
    }

    hasBothImages() {
        return this.image1File && this.image2File;
    }

    autoCompare() {
        if (this.hasBothImages()) {
            this.compareImages();
        }
    }

    async compareImages() {
        if (!this.hasBothImages()) {
            alert('Please drag and drop 2 images first!');
            return;
        }

        try {
            const img1 = await Utils.loadImage(this.image1File);
            const img2 = await Utils.loadImage(this.image2File);

            const options = this.optionsManager.getOptions();
            const width = options.maxDim;
            const height = options.maxDim;

            const data1 = Utils.drawScaled(img1, width, height);
            const data2 = Utils.drawScaled(img2, width, height);

            // Create diff array for pixelmatch to draw
            const diff = new Uint8ClampedArray(width * height * 4);

            // pixelmatch comparison with options
            const mismatched = pixelmatch(data1.data, data2.data, diff, width, height, options);

            // Calculate difference percentage
            const totalPixels = width * height;
            const diffPercent = (mismatched / totalPixels) * 100;

            // Render the diff image
            this.imageDisplayManager.renderDiffImage(diff, width, height);

            // Get result category and render result
            const resultConfig = Utils.getResultCategory(diffPercent);
            this.imageDisplayManager.renderResult(
                mismatched,
                totalPixels,
                diffPercent,
                resultConfig
            );
        } catch (error) {
            console.error('Error comparing images:', error);
            alert('Error comparing images. Please try again.');
        }
    }

    downloadDiffImage() {
        const diffDisplay = document.getElementById('diff-display');
        const img = diffDisplay.querySelector('img');

        if (img) {
            const link = document.createElement('a');
            link.download = 'diff-image.png';
            link.href = img.src;
            link.click();
        }
    }

    toggleOptions() {
        const content = document.getElementById('options-content');
        const icon = document.getElementById('toggle-icon');

        if (content.classList.contains('collapsed')) {
            content.classList.remove('collapsed');
            icon.textContent = '▼';
            icon.style.transform = 'rotate(0deg)';
        } else {
            content.classList.add('collapsed');
            icon.textContent = '▶';
            icon.style.transform = 'rotate(0deg)';
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Make the app globally accessible for HTML onclick handlers
    window.ImageCompareApp = new ImageCompareApp();
});
