import pickle
import tensorflow as tf
from tensorflow.keras.models import load_model
import numpy as np
import os
import re
from collections import Counter

class ModelPredictor:
    def __init__(self, models_path):
        self.models_path = models_path
        self.model = None
        self.tokenizer = None
        self.vocab = None
        self.word_to_index = {}
        self.index_to_word = {}
        self.max_sequence_length = 50  # Adjust based on your model
        
        self.load_all_models()
    
    def load_all_models(self):
        """Load all available model files"""
        try:
            # Try loading different model formats
            keras_path = os.path.join(self.models_path, 'model.keras')
            h5_path = os.path.join(self.models_path, 'model.h5')
            pkl_path = os.path.join(self.models_path, 'model.pkl')
            
            # Load Keras/H5 model
            if os.path.exists(keras_path):
                self.model = load_model(keras_path)
                print("Loaded .keras model")
            elif os.path.exists(h5_path):
                self.model = load_model(h5_path)
                print("Loaded .h5 model")
            
            # Load tokenizer/vocabulary from pickle
            if os.path.exists(pkl_path):
                with open(pkl_path, 'rb') as f:
                    pkl_data = pickle.load(f)
                    
                # Handle different pickle file structures
                if isinstance(pkl_data, dict):
                    if 'tokenizer' in pkl_data:
                        self.tokenizer = pkl_data['tokenizer']
                    if 'vocab' in pkl_data:
                        self.vocab = pkl_data['vocab']
                    if 'word_to_index' in pkl_data:
                        self.word_to_index = pkl_data['word_to_index']
                        self.index_to_word = {v: k for k, v in self.word_to_index.items()}
                else:
                    # If pickle contains tokenizer directly
                    self.tokenizer = pkl_data
                
                print("Loaded pickle data")
            
            # If no tokenizer loaded, create a basic one
            if not self.tokenizer and not self.word_to_index:
                self.create_basic_tokenizer()
                
        except Exception as e:
            print(f"Error loading models: {e}")
            raise e
    
    def create_basic_tokenizer(self):
        """Create a basic tokenizer if none is available"""
        # This is a fallback - you should ideally save your tokenizer
        common_words = [
            'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have',
            'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you',
            'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they',
            'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my',
            'one', 'all', 'would', 'there', 'their', 'what', 'so',
            'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me'
        ]
        
        self.word_to_index = {word: i+1 for i, word in enumerate(common_words)}
        self.word_to_index['<UNK>'] = 0
        self.index_to_word = {v: k for k, v in self.word_to_index.items()}
        self.vocab_size = len(self.word_to_index)
    
    def preprocess_text(self, text):
        """Preprocess input text"""
        # Convert to lowercase and remove special characters
        text = re.sub(r'[^a-zA-Z0-9\s]', '', text.lower())
        words = text.split()
        
        # Convert words to indices
        if self.tokenizer and hasattr(self.tokenizer, 'word_index'):
            # Using Keras tokenizer
            word_indices = [self.tokenizer.word_index.get(word, 0) for word in words]
        else:
            # Using custom word_to_index
            word_indices = [self.word_to_index.get(word, 0) for word in words]
        
        # Pad or truncate sequence
        if len(word_indices) > self.max_sequence_length:
            word_indices = word_indices[-self.max_sequence_length:]
        else:
            word_indices = [0] * (self.max_sequence_length - len(word_indices)) + word_indices
        
        return np.array([word_indices])
    
    def predict_next_words(self, text, num_predictions=5):
        """Predict next words based on input text"""
        if not self.model:
            return []
        
        try:
            # Preprocess input
            input_sequence = self.preprocess_text(text)
            
            # Make prediction
            predictions = self.model.predict(input_sequence, verbose=0)
            
            # Get top predictions
            if len(predictions.shape) > 2:
                # If model returns sequence, get last timestep
                predictions = predictions[0, -1, :]
            else:
                predictions = predictions[0]
            
            # Get top indices
            top_indices = np.argsort(predictions)[-num_predictions:][::-1]
            
            # Convert indices to words
            predicted_words = []
            for idx in top_indices:
                if self.tokenizer and hasattr(self.tokenizer, 'index_word'):
                    word = self.tokenizer.index_word.get(idx, '<UNK>')
                else:
                    word = self.index_to_word.get(idx, '<UNK>')
                
                if word != '<UNK>' and word not in predicted_words:
                    predicted_words.append(word)
            
            return predicted_words[:num_predictions]
        
        except Exception as e:
            print(f"Prediction error: {e}")
            return []