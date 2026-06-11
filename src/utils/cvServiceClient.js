/**
 * Client for communicating with the Python CV Microservice.
 * Forwards files from multer memory/disk to the Python endpoints.
 */

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const config = require('../config');
const ApiError = require('./ApiError');
const logger = require('./logger');

// Fallback to node-fetch if global fetch is not available (Node < 18)
// For Node 18+, we can just use the built-in fetch.
// In this project, Node engine is >=18.0.0, so global fetch is available.

class CvServiceClient {
  /**
   * Helper to forward a file to the CV microservice.
   * @param {string} endpoint - The specific endpoint (e.g., "/deepfake")
   * @param {Object} file - Multer file object
   * @param {Object} additionalData - Additional form data fields
   * @returns {Promise<Object>} The JSON response from the CV service
   */
  static async _forwardFile(endpoint, file, additionalData = {}, fileFieldName = 'image') {
    const url = `${config.cvServiceUrl}${endpoint}`;
    
    const formData = new FormData();
    
    // Append the file
    // Multer diskStorage stores the file path in `file.path`
    if (file.path) {
        formData.append(fileFieldName, fs.createReadStream(file.path), {
            filename: file.originalname,
            contentType: file.mimetype
        });
    } else if (file.buffer) {
        // Fallback for memoryStorage
        formData.append(fileFieldName, file.buffer, {
            filename: file.originalname,
            contentType: file.mimetype
        });
    } else {
        throw new Error("Invalid file object provided to CV client");
    }

    // Append additional data
    for (const [key, value] of Object.entries(additionalData)) {
      if (value !== undefined && value !== null) {
        // If value is an object or array, JSON stringify it
        if (typeof value === 'object') {
            formData.append(key, JSON.stringify(value));
        } else {
            formData.append(key, String(value));
        }
      }
    }

    logger.info(`Sending request to CV service: POST ${url}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        // Don't set Content-Type header manually when using FormData, 
        // it needs to set the boundary automatically
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.error(`CV Service error (${response.status}): ${JSON.stringify(errorData)}`);
        throw new ApiError(response.status, `CV Service error: ${errorData.detail || response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      logger.error(`Failed to reach CV service: ${error.message}`);
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, "Computer Vision service is currently unavailable");
    }
  }

  static async detectDeepfake(file, threshold = 0.5) {
    return this._forwardFile('/deepfake', file, { threshold }, 'image');
  }

  static async detectLiveness(file, challenges = null) {
    return this._forwardFile('/liveness', file, { challenges }, 'video');
  }

  static async detectRppg(file, fps = null) {
    return this._forwardFile('/rppg', file, { fps }, 'video');
  }

  static async detectNoise(file, threshold = 0.5) {
    return this._forwardFile('/noise', file, { threshold }, 'image');
  }
}

module.exports = CvServiceClient;
