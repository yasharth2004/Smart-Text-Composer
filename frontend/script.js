class TextPredictor {
    constructor() {
        this.apiUrl = 'http://localhost:5000';
        this.editor = document.getElementById('editor');
        this.predictionsOverlay = document.getElementById('predictions');
        this.suggestionsList = document.getElementById('suggestions-list');
        this.loadingSpinner = document.getElementById('loading');
        this.statusDot = document.getElementById('status-dot');
        this.statusText = document.getElementById('status-text');
        this.wordCount = document.getElementById('word-count');
        this.charCount = document.getElementById('char-count');
        
        this.currentPredictions = [];
        this.isLoading = false;
        this.debounceTimer = null;
        this.lastCursorPos = 0;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.checkServerStatus();
        this.updateStats();
    }
    
    setupEventListeners() {
        // Editor events
        this.editor.addEventListener('input', (e) => this.handleInput(e));
        this.editor.addEventListener('keydown', (e) => this.handleKeydown(e));
        this.editor.addEventListener('blur', () => this.clearPredictions());
        this.editor.addEventListener('focus', () => this.handleInput());
        this.editor.addEventListener('click', () => this.handleCursorChange());
        this.editor.addEventListener('keyup', () => this.handleCursorChange());
        
        // Button events
        document.getElementById('clear-btn').addEventListener('click', () => this.clearEditor());
        document.getElementById('copy-btn').addEventListener('click', () => this.copyText());
        
        // Prevent default behavior for contenteditable
        this.editor.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text');
            document.execCommand('insertText', false, text);
        });
    }
    
    async checkServerStatus() {
        try {
            const response = await fetch(`${this.apiUrl}/health`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            if (response.ok) {
                this.updateStatus('connected', 'Connected');
            } else {
                this.updateStatus('error', 'Server Error');
            }
        } catch (error) {
            console.error('Server connection error:', error);
            this.updateStatus('error', 'Disconnected');
            // Try to reconnect after 5 seconds
            setTimeout(() => this.checkServerStatus(), 5000);
        }
    }
    
    updateStatus(status, text) {
        this.statusDot.className = `status-dot ${status}`;
        this.statusText.textContent = text;
    }
    
    handleInput(e) {
        this.updateStats();
        this.handleCursorChange();
        
        // Debounce predictions
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.getPredictions();
        }, 300);
    }
    
    handleCursorChange() {
        const cursorPos = this.getCursorPosition();
        if (cursorPos !== this.lastCursorPos) {
            this.lastCursorPos = cursorPos;
            this.clearPredictionOverlay();
        }
    }
    
    handleKeydown(e) {
        if (e.key === 'Tab' && this.currentPredictions.length > 0) {
            e.preventDefault();
            this.acceptPrediction(this.currentPredictions[0]);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this.clearPredictions();
        } else if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            document.execCommand('insertLineBreak');
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            // Handle arrow keys for suggestion navigation
            this.handleSuggestionNavigation(e);
        }
    }
    
    handleSuggestionNavigation(e) {
        const suggestions = this.suggestionsList.querySelectorAll('.suggestion-item:not(.no-suggestions)');
        if (suggestions.length === 0) return;
        
        const currentActive = this.suggestionsList.querySelector('.suggestion-item.active');
        let nextIndex = 0;
        
        if (currentActive) {
            const currentIndex = Array.from(suggestions).indexOf(currentActive);
            if (e.key === 'ArrowDown') {
                nextIndex = (currentIndex + 1) % suggestions.length;
            } else {
                nextIndex = (currentIndex - 1 + suggestions.length) % suggestions.length;
            }
            currentActive.classList.remove('active');
        }
        
        suggestions[nextIndex].classList.add('active');
    }
    
    getCursorPosition() {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return 0;
        
        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(this.editor);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        return preCaretRange.toString().length;
    }
    
    setCursorPosition(pos) {
        const selection = window.getSelection();
        const range = document.createRange();
        
        let charCount = 0;
        let walker = document.createTreeWalker(
            this.editor,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        let node;
        while (node = walker.nextNode()) {
            const nextCharCount = charCount + node.textContent.length;
            if (pos <= nextCharCount) {
                range.setStart(node, pos - charCount);
                range.collapse(true);
                break;
            }
            charCount = nextCharCount;
        }
        
        selection.removeAllRanges();
        selection.addRange(range);
    }
    
    getEditorText() {
        return this.editor.textContent || '';
    }
    
    async getPredictions() {
        const text = this.getEditorText().trim();
        
        if (text.length < 2) {
            this.clearPredictions();
            return;
        }
        
        if (this.isLoading) return;
        
        this.showLoading(true);
        
        try {
            const response = await fetch(`${this.apiUrl}/predict`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    text: text,
                    max_predictions: 5,
                    cursor_position: this.getCursorPosition()
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            this.currentPredictions = data.predictions || [];
            this.displayPredictions();
            this.updateStatus('connected', 'Connected');
            
        } catch (error) {
            console.error('Prediction error:', error);
            this.updateStatus('error', 'Prediction Error');
            this.clearPredictions();
        } finally {
            this.showLoading(false);
        }
    }
    
    displayPredictions() {
        // Update overlay
        if (this.currentPredictions.length > 0 && this.editor === document.activeElement) {
            const cursorPos = this.getCursorPosition();
            const prediction = this.currentPredictions[0];
            this.showPredictionOverlay(prediction, cursorPos);
        } else {
            this.clearPredictionOverlay();
        }
        
        // Update suggestions panel
        this.updateSuggestionsPanel();
    }
    
    showPredictionOverlay(prediction, cursorPos) {
        const editorText = this.getEditorText();
        const beforeCursor = editorText.substring(0, cursorPos);
        const afterCursor = editorText.substring(cursorPos);
        
        // Clear previous predictions
        this.predictionsOverlay.innerHTML = '';
        
        // Create invisible text before cursor
        const beforeSpan = document.createElement('span');
        beforeSpan.textContent = beforeCursor;
        beforeSpan.style.visibility = 'hidden';
        
        // Create highlighted prediction
        const predictionSpan = document.createElement('span');
        predictionSpan.className = 'prediction-highlight';
        predictionSpan.textContent = prediction;
        
        // Create invisible text after cursor
        const afterSpan = document.createElement('span');
        afterSpan.textContent = afterCursor;
        afterSpan.style.visibility = 'hidden';
        
        this.predictionsOverlay.appendChild(beforeSpan);
        this.predictionsOverlay.appendChild(predictionSpan);
        this.predictionsOverlay.appendChild(afterSpan);
    }
    
    clearPredictionOverlay() {
        this.predictionsOverlay.innerHTML = '';
    }
    
    updateSuggestionsPanel() {
        this.suggestionsList.innerHTML = '';
        
        if (this.currentPredictions.length === 0) {
            const noSuggestions = document.createElement('div');
            noSuggestions.className = 'no-suggestions';
            noSuggestions.textContent = 'No suggestions available';
            this.suggestionsList.appendChild(noSuggestions);
            return;
        }
        
        this.currentPredictions.forEach((prediction, index) => {
            const suggestionItem = document.createElement('div');
            suggestionItem.className = `suggestion-item ${index === 0 ? 'primary' : ''}`;
            suggestionItem.textContent = prediction;
            
            suggestionItem.addEventListener('click', () => {
                this.acceptPrediction(prediction);
            });
            
            this.suggestionsList.appendChild(suggestionItem);
        });
    }
    
    acceptPrediction(prediction) {
        const cursorPos = this.getCursorPosition();
        const currentText = this.getEditorText();
        
        // Insert prediction at cursor position
        const beforeCursor = currentText.substring(0, cursorPos);
        const afterCursor = currentText.substring(cursorPos);
        const newText = beforeCursor + ' ' + prediction + afterCursor;
        
        // Update editor content
        this.editor.textContent = newText;
        
        // Set cursor after the inserted prediction
        const newCursorPos = cursorPos + prediction.length + 1;
        setTimeout(() => {
            this.setCursorPosition(newCursorPos);
            this.editor.focus();
        }, 0);
        
        this.clearPredictions();
        this.updateStats();
        
        // Get new predictions after a short delay
        setTimeout(() => {
            this.getPredictions();
        }, 100);
    }
    
    clearPredictions() {
        this.currentPredictions = [];
        this.clearPredictionOverlay();
        this.updateSuggestionsPanel();
    }
    
    showLoading(show) {
        this.isLoading = show;
        if (show) {
            this.loadingSpinner.classList.add('active');
        } else {
            this.loadingSpinner.classList.remove('active');
        }
    }
    
    updateStats() {
        const text = this.getEditorText();
        const words = text.trim().split(/\s+/).filter(word => word.length > 0);
        
        this.wordCount.textContent = words.length;
        this.charCount.textContent = text.length;
    }
    
    clearEditor() {
        this.editor.textContent = '';
        this.editor.focus();
        this.clearPredictions();
        this.updateStats();
    }
    
    async copyText() {
        const text = this.getEditorText();
        
        try {
            await navigator.clipboard.writeText(text);
            
            // Show feedback
            const copyBtn = document.getElementById('copy-btn');
            const originalText = copyBtn.textContent;
            copyBtn.textContent = 'Copied!';
            copyBtn.style.background = '#4CAF50';
            
            setTimeout(() => {
                copyBtn.textContent = originalText;
                copyBtn.style.background = '';
            }, 2000);
            
        } catch (error) {
            console.error('Failed to copy text:', error);
            
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
        }
    }
}

// Initialize the text predictor when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.textPredictor = new TextPredictor();
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && window.textPredictor) {
        // Check server status when page becomes visible
        window.textPredictor.checkServerStatus();
    }
});

// Handle online/offline events
window.addEventListener('online', () => {
    if (window.textPredictor) {
        window.textPredictor.checkServerStatus();
    }
});

window.addEventListener('offline', () => {
    if (window.textPredictor) {
        window.textPredictor.updateStatus('error', 'Offline');
    }
});