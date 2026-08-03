#pragma once

#include <Arduino.h>
#include "esp_camera.h"

#include "app_state.h"
#include "config.h"
#include "types.h"
#include "json_utils.h"

#if ESP32CAM_HAS_FACE_MODELS
  #include <cmath>
  #include <list>
  #include <string>
  #include <vector>

  #include "fb_gfx.h"
  #include "img_converters.h"
#endif

static bool acquireFaceLock() {
  if (faceBusy) {
    return false;
  }

  faceBusy = true;
  return true;
}

static void releaseFaceLock() {
  faceBusy = false;
}

static String buildSimpleFaceResultJson(bool ok, const String& action, const String& message) {
  String body = "{";
  body += "\"ok\":";
  body += ok ? "true" : "false";
  body += ",\"action\":\"" + escapeJson(action) + "\"";
  body += ",\"message\":\"" + escapeJson(message) + "\"";
  body += ",\"faceDetectionAvailable\":";
  body += faceDetectionAvailable ? "true" : "false";
  body += ",\"faceRecognitionAvailable\":";
  body += faceRecognitionAvailable ? "true" : "false";
  body += ",\"enrolledCount\":" + String(enrolledFaceCount());
  body += ",\"faces\":[]";
  body += "}";
  return body;
}

static void updateLastFaceResult(const String& body) {
  lastFaceResultJson = body;
}

static String buildFaceResultJson(const String& action, const FaceProcessingOutcome& outcome) {
  String body = "{";
  body += "\"ok\":";
  body += outcome.ok ? "true" : "false";
  body += ",\"action\":\"" + escapeJson(action) + "\"";
  body += ",\"message\":\"" + escapeJson(outcome.message) + "\"";
  body += ",\"width\":" + String(outcome.width);
  body += ",\"height\":" + String(outcome.height);
  body += ",\"faceCount\":" + String(outcome.faceCount);
  body += ",\"detected\":";
  body += outcome.detected ? "true" : "false";
  body += ",\"recognized\":";
  body += outcome.recognized ? "true" : "false";
  body += ",\"recognizedId\":" + String(outcome.recognizedId);
  body += ",\"recognizedName\":\"" + escapeJson(outcome.matchedName) + "\"";
  body += ",\"similarity\":" + String(outcome.similarity, 4);
  body += ",\"detectionScore\":" + String(outcome.detectionScore, 4);
  body += ",\"embeddingExtracted\":";
  body += outcome.embeddingExtracted ? "true" : "false";
  body += ",\"model\":\"" + escapeJson(outcome.embeddingModel) + "\"";
  body += ",\"dimension\":" + String(outcome.embedding.size());
  body += ",\"enrolled\":";
  body += outcome.enrolled ? "true" : "false";
  body += ",\"enrolledId\":" + String(outcome.enrolledId);
  body += ",\"enrolledName\":\"" + escapeJson(outcome.enrolledName) + "\"";
  body += ",\"faceDetectionAvailable\":";
  body += faceDetectionAvailable ? "true" : "false";
  body += ",\"faceRecognitionAvailable\":";
  body += faceRecognitionAvailable ? "true" : "false";
  body += ",\"enrolledCount\":" + String(enrolledFaceCount());
  body += ",\"faces\":" + outcome.facesJson;
  body += "}";
  return body;
}

static String buildEmbeddingArrayJson(const std::vector<float>& embedding) {
  String body;
  body.reserve(embedding.size() * 11U + 2U);
  body += "[";
  for (size_t index = 0; index < embedding.size(); ++index) {
    if (index > 0) {
      body += ",";
    }
    body += String(embedding[index], 7);
  }
  body += "]";
  return body;
}

static String buildEmbeddingResultJson(
  const String& action,
  const FaceProcessingOutcome& outcome,
  bool includeEmbedding = true
) {
  String body;
  body.reserve(includeEmbedding ? outcome.embedding.size() * 11U + 320U : 320U);
  body += "{";
  body += "\"ok\":";
  body += outcome.ok && outcome.embeddingExtracted ? "true" : "false";
  body += ",\"action\":\"" + escapeJson(action) + "\"";
  body += ",\"message\":\"" + escapeJson(outcome.message) + "\"";
  body += ",\"faceCount\":" + String(outcome.faceCount);
  body += ",\"detectionScore\":" + String(outcome.detectionScore, 4);
  body += ",\"model\":\"" + escapeJson(outcome.embeddingModel) + "\"";
  body += ",\"dimension\":" + String(outcome.embedding.size());
  body += ",\"embeddingNormalized\":";
  body += outcome.embeddingExtracted ? "true" : "false";
  if (includeEmbedding) {
    body += ",\"vector\":" + buildEmbeddingArrayJson(outcome.embedding);
  }
  body += "}";
  return body;
}

#if ESP32CAM_HAS_FACE_MODELS

static void setupFaceEngine() {
  faceDetectionAvailable = psramFound();
  faceRecognitionAvailable = false;

  if (!faceDetectionAvailable) {
    faceEngineMessage = "Face detection needs PSRAM on ESP32-CAM.";
    updateLastFaceResult(buildSimpleFaceResultJson(false, "init", faceEngineMessage));
    return;
  }

  faceDetectorStageOne = new HumanFaceDetectMSR01(
    kFaceDetectScoreThreshold,
    kFaceDetectNmsThreshold,
    kFaceDetectTopK,
    kFaceDetectResizeScale
  );
  faceDetectorStageTwo = new HumanFaceDetectMNP01(
    kFaceKeypointScoreThreshold,
    kFaceKeypointNmsThreshold,
    kFaceKeypointTopK
  );

  if (faceDetectorStageOne == nullptr || faceDetectorStageTwo == nullptr) {
    faceDetectionAvailable = false;
    faceEngineMessage = "Không đủ bộ nhớ để khởi tạo detector model.";
    updateLastFaceResult(buildSimpleFaceResultJson(false, "init", faceEngineMessage));
    return;
  }

  recognizer.set_thresh(kFaceRecognitionThreshold);
  // PostgreSQL/backend is the only identity source of truth. Never load stale
  // local templates from the legacy `fr` partition into the matching roster.
  recognizer.clear_id(false);
  faceRecognitionAvailable = true;
  faceEngineMessage = "Face detection and normalized embedding extraction are ready.";
  updateLastFaceResult(buildSimpleFaceResultJson(true, "init", faceEngineMessage));
}

static String buildFacesJson(const std::list<dl::detect::result_t>& results, const FaceProcessingOutcome& outcome) {
  String faces = "[";
  size_t index = 0;

  for (std::list<dl::detect::result_t>::const_iterator prediction = results.begin();
       prediction != results.end() && index < kMaxFaceBoxesInJson;
       ++prediction, ++index) {
    const int x = static_cast<int>(prediction->box[0]);
    const int y = static_cast<int>(prediction->box[1]);
    const int w = static_cast<int>(prediction->box[2]) - x + 1;
    const int h = static_cast<int>(prediction->box[3]) - y + 1;
    const bool matched = outcome.recognized && index == 0;
    const String faceName = matched ? outcome.matchedName : "";
    const float faceSimilarity = matched ? outcome.similarity : 0.0F;

    if (index > 0) {
      faces += ",";
    }

    faces += "{";
    faces += "\"x\":" + String(x);
    faces += ",\"y\":" + String(y);
    faces += ",\"w\":" + String(w);
    faces += ",\"h\":" + String(h);
    faces += ",\"score\":" + String(prediction->score, 4);
    faces += ",\"name\":\"" + escapeJson(faceName) + "\"";
    faces += ",\"similarity\":" + String(faceSimilarity, 4);
    faces += ",\"matched\":";
    faces += matched ? "true" : "false";
    faces += "}";
  }

  faces += "]";
  return faces;
}

static uint32_t toFrameColor(fb_data_t* frame, uint32_t color) {
  if (frame->bytes_per_pixel != 2) {
    return color;
  }

  return ((color >> 16) & 0x001F) | ((color >> 3) & 0x07E0) | ((color << 8) & 0xF800);
}

static void drawFaceBoxes(fb_data_t* frame, const std::list<dl::detect::result_t>& results, const String& primaryLabel, bool matched) {
  uint32_t lineColor = matched ? 0x0000FF00 : 0x0000FFFF;
  lineColor = toFrameColor(frame, lineColor);

  size_t index = 0;
  for (std::list<dl::detect::result_t>::const_iterator prediction = results.begin();
       prediction != results.end();
       ++prediction, ++index) {
    int x = static_cast<int>(prediction->box[0]);
    int y = static_cast<int>(prediction->box[1]);
    int w = static_cast<int>(prediction->box[2]) - x + 1;
    int h = static_cast<int>(prediction->box[3]) - y + 1;

    if ((x + w) > frame->width) {
      w = frame->width - x;
    }
    if ((y + h) > frame->height) {
      h = frame->height - y;
    }

    fb_gfx_drawFastHLine(frame, x, y, w, lineColor);
    fb_gfx_drawFastHLine(frame, x, y + h - 1, w, lineColor);
    fb_gfx_drawFastVLine(frame, x, y, h, lineColor);
    fb_gfx_drawFastVLine(frame, x + w - 1, y, h, lineColor);

    for (int keypointIndex = 0; keypointIndex + 1 < static_cast<int>(prediction->keypoint.size()); keypointIndex += 2) {
      const int keypointX = prediction->keypoint[keypointIndex];
      const int keypointY = prediction->keypoint[keypointIndex + 1];
      fb_gfx_fillRect(frame, keypointX, keypointY, 3, 3, lineColor);
    }

    if (index == 0 && primaryLabel.length() > 0) {
      int labelY = y > 18 ? y - 18 : y + 6;
      fb_gfx_print(frame, x, labelY, lineColor, primaryLabel.c_str());
    }
  }
}

static void releaseFaceInputFrame(camera_fb_t* frame, const FaceProcessingOptions& options) {
  if (frame != nullptr && options.returnFrameToCamera) {
    esp_camera_fb_return(frame);
  }
}

static bool copyNormalizedCurrentEmbedding(FaceProcessingOutcome& outcome) {
  dl::Tensor<float>& modelEmbedding = recognizer.get_face_emb(-1);
  const int dimension = modelEmbedding.get_size();
  const float* values = modelEmbedding.get_element_ptr();
  if (values == nullptr || dimension <= 0
      || static_cast<size_t>(dimension) > kMaxFaceEmbeddingDimension) {
    outcome.error = "Face model returned an invalid embedding.";
    return false;
  }

  outcome.embedding.clear();
  outcome.embedding.reserve(static_cast<size_t>(dimension));
  double squaredNorm = 0.0;
  for (int index = 0; index < dimension; ++index) {
    const float value = values[index];
    if (!std::isfinite(value)) {
      outcome.embedding.clear();
      outcome.error = "Face model returned a non-finite embedding.";
      return false;
    }
    outcome.embedding.push_back(value);
    squaredNorm += static_cast<double>(value) * static_cast<double>(value);
  }

  if (!std::isfinite(squaredNorm) || squaredNorm <= 1.0e-12) {
    outcome.embedding.clear();
    outcome.error = "Face model returned a zero-length embedding.";
    return false;
  }

  const float inverseNorm = 1.0F / static_cast<float>(std::sqrt(squaredNorm));
  for (float& value : outcome.embedding) {
    value *= inverseNorm;
  }

  outcome.embeddingExtracted = true;
  outcome.embeddingModel = kFaceEmbeddingModel;
  return true;
}

static bool processFrameForFace(camera_fb_t* frame, const FaceProcessingOptions& options, FaceProcessingOutcome& outcome, uint8_t jpegQuality = kFaceJpegQuality) {
  if (frame == nullptr) {
    outcome.error = "Camera frame is null.";
    return false;
  }

  outcome.ok = true;
  outcome.width = frame->width;
  outcome.height = frame->height;

  if (!faceDetectionAvailable) {
    outcome.ok = false;
    outcome.error = "Face detection is unavailable on this board configuration.";
    releaseFaceInputFrame(frame, options);
    return false;
  }

  if ((options.recognize || options.extractEmbedding || options.enroll) && !faceRecognitionAvailable) {
    outcome.ok = false;
    outcome.error = "Face embedding model is unavailable.";
    releaseFaceInputFrame(frame, options);
    return false;
  }

  const size_t rgbLength = static_cast<size_t>(outcome.width) * static_cast<size_t>(outcome.height) * 3U;
  uint8_t* rgbBuffer = static_cast<uint8_t*>(malloc(rgbLength));
  if (rgbBuffer == nullptr) {
    outcome.ok = false;
    outcome.error = "Not enough memory for RGB face processing buffer.";
    releaseFaceInputFrame(frame, options);
    return false;
  }

  const bool converted = fmt2rgb888(frame->buf, frame->len, frame->format, rgbBuffer);
  releaseFaceInputFrame(frame, options);
  if (!converted) {
    free(rgbBuffer);
    outcome.ok = false;
    outcome.error = "Failed to convert frame to RGB888.";
    return false;
  }

  fb_data_t rgbFrame;
  rgbFrame.width = outcome.width;
  rgbFrame.height = outcome.height;
  rgbFrame.bytes_per_pixel = 3;
  rgbFrame.format = FB_BGR888;
  rgbFrame.data = rgbBuffer;

  if (faceDetectorStageOne == nullptr || faceDetectorStageTwo == nullptr) {
    free(rgbBuffer);
    outcome.ok = false;
    outcome.error = "Face detector model is not initialized.";
    return false;
  }

  std::vector<int> shape = {outcome.height, outcome.width, 3};
  std::list<dl::detect::result_t>& candidates = faceDetectorStageOne->infer(rgbBuffer, shape);
  std::list<dl::detect::result_t>& results = faceDetectorStageTwo->infer(rgbBuffer, shape, candidates);

  outcome.faceCount = static_cast<int>(results.size());
  outcome.detected = outcome.faceCount > 0;

  if (outcome.detected) {
    std::list<dl::detect::result_t>::iterator primaryFace = results.begin();
    outcome.detectionScore = primaryFace->score;
    dl::Tensor<uint8_t> tensor;
    tensor.set_element(rgbBuffer).set_shape({outcome.height, outcome.width, 3}).set_auto_free(false);

    if (options.enroll) {
      if (outcome.faceCount != 1) {
        outcome.ok = false;
        outcome.message = "Đăng ký cần đúng 1 khuôn mặt rõ trong khung hình.";
      } else {
        int enrolledId = recognizer.enroll_id(
          tensor,
          primaryFace->keypoint,
          std::string(options.enrollName.c_str()),
          true
        );

        if (enrolledId >= 0) {
          outcome.enrolled = true;
          outcome.enrolledId = enrolledId;
          outcome.enrolledName = options.enrollName;
          outcome.message = "Đăng ký khuôn mặt thành công.";
        } else {
          outcome.ok = false;
          outcome.message = "Không thể lưu khuôn mặt vào flash.";
        }
      }
    }

    const bool embeddingFaceCountAccepted =
      !options.requireSingleFaceForEmbedding || outcome.faceCount == 1;
    if (options.extractEmbedding && !embeddingFaceCountAccepted) {
      outcome.ok = false;
      outcome.message = "Embedding requires exactly one clear face in the image.";
    }

    if ((options.recognize || options.extractEmbedding) && embeddingFaceCountAccepted) {
      // recognize() performs alignment and the FaceRecognition112V1S8 forward
      // pass. Its local ID match remains compatibility-only; access decisions
      // use the normalized current embedding and are made by the backend.
      face_info_t recognizedFace = recognizer.recognize(tensor, primaryFace->keypoint);
      outcome.similarity = recognizedFace.similarity;

      if (options.extractEmbedding && !copyNormalizedCurrentEmbedding(outcome)) {
        outcome.ok = false;
        if (outcome.message.length() == 0) {
          outcome.message = outcome.error;
        }
      } else if (options.extractEmbedding && outcome.message.length() == 0) {
        outcome.message = "Face embedding extracted successfully.";
      }

      if (options.recognize
          && recognizedFace.id >= 0
          && recognizedFace.similarity >= kFaceRecognitionThreshold) {
        outcome.recognized = true;
        outcome.recognizedId = recognizedFace.id;
        outcome.matchedName = String(recognizedFace.name.c_str());
        if (outcome.matchedName.length() == 0) {
          outcome.matchedName = "ID " + String(recognizedFace.id);
        }
        if (outcome.message.length() == 0) {
          outcome.message = "Nhận diện được khuôn mặt đã đăng ký.";
        }
      } else if (options.recognize && outcome.message.length() == 0) {
        outcome.message = "Phát hiện mặt nhưng chưa khớp danh tính đã đăng ký.";
      }
    }

    if (!options.recognize && !options.extractEmbedding && !options.enroll) {
      outcome.message = "Phát hiện được khuôn mặt trong khung hình.";
    }

    if (options.drawBoxes) {
      String label = "Face";
      if (options.enroll) {
        label = outcome.enrolled ? ("Enrolled: " + outcome.enrolledName) : "Enroll failed";
      } else if (options.recognize) {
        label = outcome.recognized ? outcome.matchedName : "Unknown";
      } else if (options.extractEmbedding) {
        label = outcome.embeddingExtracted ? "Embedding ready" : "Embedding failed";
      }

      drawFaceBoxes(&rgbFrame, results, label, outcome.recognized || outcome.enrolled);
    }
  } else {
    if (options.enroll) {
      outcome.ok = false;
      outcome.message = "Không phát hiện được khuôn mặt để đăng ký.";
    } else if (options.extractEmbedding) {
      outcome.ok = false;
      outcome.message = "No face was detected for embedding extraction.";
    } else if (options.recognize) {
      outcome.message = "Không phát hiện được khuôn mặt để nhận diện.";
    } else {
      outcome.message = "Không phát hiện khuôn mặt trong khung hình.";
    }
  }

  outcome.facesJson = buildFacesJson(results, outcome);

  if (!options.encodeJpeg) {
    free(rgbBuffer);
    return true;
  }

  if (!fmt2jpg(rgbBuffer, rgbLength, outcome.width, outcome.height, PIXFORMAT_RGB888, jpegQuality, &outcome.jpegBuffer, &outcome.jpegLength)) {
    free(rgbBuffer);
    outcome.ok = false;
    outcome.error = "Failed to encode processed JPEG frame.";
    return false;
  }

  free(rgbBuffer);
  return true;
}

#else

static void setupFaceEngine() {
  faceDetectionAvailable = false;
  faceRecognitionAvailable = false;
  faceEngineMessage = "Face detection/recognition is unavailable: this Arduino-ESP32 installation does not include esp-dl model headers.";
  updateLastFaceResult(buildSimpleFaceResultJson(false, "init", faceEngineMessage));
}

static bool processFrameForFace(camera_fb_t* frame, const FaceProcessingOptions&, FaceProcessingOutcome& outcome, uint8_t = kFaceJpegQuality) {
  if (frame != nullptr) {
    esp_camera_fb_return(frame);
  }

  outcome.ok = false;
  outcome.error = faceEngineMessage;
  return false;
}

#endif
