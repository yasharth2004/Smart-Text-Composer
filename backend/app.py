from flask import Flask, request, jsonify
from flask_cors import CORS
import pickle
import tensorflow as tf
from tensorflow.keras.models import load_model
import numpy as np
import os
from model_loader import ModelPredictor

app = Flask(__name__)
CORS(app)

# Initialize model predictor
model_predictor = None

def load_models():
    global model_predictor
    try:
        model_predictor = ModelPredictor('models/')
        print("Models loaded successfully!")
    except Exception as e:
        print(f"Error loading models: {e}")
        model_predictor = None

@app.route('/')
def home():
    return jsonify({"message": "Text Prediction API is running!"})

@app.route('/predict', methods=['POST'])
def predict():
    try:
        if model_predictor is None:
            return jsonify({"error": "Models not loaded"}), 500
        
        data = request.get_json()
        if not data or 'text' not in data:
            return jsonify({"error": "No text provided"}), 400
        
        text = data['text']
        if not text.strip():
            return jsonify({"predictions": []}), 200
        
        predictions = model_predictor.predict_next_words(text, num_predictions=5)
        
        return jsonify({"predictions": predictions})
    
    except Exception as e:
        print(f"Prediction error: {e}")
        return jsonify({"error": "Prediction failed"}), 500

@app.route('/health', methods=['GET'])
def health_check():
    status = "healthy" if model_predictor is not None else "unhealthy"
    return jsonify({"status": status})

if __name__ == '__main__':
    load_models()
    app.run(debug=True, host='0.0.0.0', port=5000)