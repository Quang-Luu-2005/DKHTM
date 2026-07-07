#include "face_engine.h"

#include <list>
#include <string>
#include <vector>

#include "../core/app_state.h"
#include "esp_partition.h"
#include "fb_gfx.h"
#include "img_converters.h"
#include "../utils/json_utils.h"

bool acquireFaceLock() {
  if (faceBusy) {
    return false;
  }

  faceBusy = true;
  return true;
}

void releaseFaceLock() {
  faceBusy = false;
}

String buildSimpleFaceResultJson(bool ok, const String& action, const String& message) {
  String body = "{";
  body += "\"ok\":";
  body += ok ? "true" : "false";
  body += ",\"action\":\"" + escapeJson(action) + "\"";
  body += ",\"message\":\"" + escapeJson(message) + "\"";
  body += ",\"faceDetectionAvailable\":";
  body += faceDetectionAvailable ? "true" : "false";
  body += ",\"faceRecognitionAvailable\":";
  body += faceRecognitionAvailable ? "true" : "false";
  body += ",\"enrolledCount\":" + String(faceRecognitionAvailable ? recognizer.get_enrolled_id_num() : 0);
  body += ",\"faces\":[]";
  body += "}";
  return body;
}

void updateLastFaceResult(const String& body) {
  lastFaceResultJson = body;
}

void setupFaceEngine() {
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
  if (recognizer.set_partition(ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_ANY, "fr") != 1) {
    faceEngineMessage = "Face recognition partition 'fr' is unavailable.";
    updateLastFaceResult(buildSimpleFaceResultJson(false, "init", faceEngineMessage));
    return;
  }

  recognizer.set_ids_from_flash();
  faceRecognitionAvailable = true;
  faceEngineMessage = "Face detection ready. Recognition runs in snapshot/manual mode.";
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

String buildFaceResultJson(const String& action, const FaceProcessingOutcome& outcome) {
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
  body += ",\"enrolled\":";
  body += outcome.enrolled ? "true" : "false";
  body += ",\"enrolledId\":" + String(outcome.enrolledId);
  body += ",\"enrolledName\":\"" + escapeJson(outcome.enrolledName) + "\"";
  body += ",\"faceDetectionAvailable\":";
  body += faceDetectionAvailable ? "true" : "false";
  body += ",\"faceRecognitionAvailable\":";
  body += faceRecognitionAvailable ? "true" : "false";
  body += ",\"enrolledCount\":" + String(faceRecognitionAvailable ? recognizer.get_enrolled_id_num() : 0);
  body += ",\"faces\":" + outcome.facesJson;
  body += "}";
  return body;
}

bool processFrameForFace(camera_fb_t* frame, const FaceProcessingOptions& options, FaceProcessingOutcome& outcome, uint8_t jpegQuality) {
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
    esp_camera_fb_return(frame);
    return false;
  }

  if ((options.recognize || options.enroll) && !faceRecognitionAvailable) {
    outcome.ok = false;
    outcome.error = "Face recognition is unavailable because the flash partition could not be prepared.";
    esp_camera_fb_return(frame);
    return false;
  }

  const size_t rgbLength = static_cast<size_t>(outcome.width) * static_cast<size_t>(outcome.height) * 3U;
  uint8_t* rgbBuffer = static_cast<uint8_t*>(malloc(rgbLength));
  if (rgbBuffer == nullptr) {
    outcome.ok = false;
    outcome.error = "Not enough memory for RGB face processing buffer.";
    esp_camera_fb_return(frame);
    return false;
  }

  const bool converted = fmt2rgb888(frame->buf, frame->len, frame->format, rgbBuffer);
  esp_camera_fb_return(frame);
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

    if (options.recognize) {
      face_info_t recognizedFace = recognizer.recognize(tensor, primaryFace->keypoint);
      if (recognizedFace.id >= 0) {
        outcome.recognized = true;
        outcome.recognizedId = recognizedFace.id;
        outcome.similarity = recognizedFace.similarity;
        outcome.matchedName = String(recognizedFace.name.c_str());
        if (outcome.matchedName.length() == 0) {
          outcome.matchedName = "ID " + String(recognizedFace.id);
        }
        if (outcome.message.length() == 0) {
          outcome.message = "Nhận diện được khuôn mặt đã đăng ký.";
        }
      } else if (outcome.message.length() == 0) {
        outcome.message = "Phát hiện mặt nhưng chưa khớp danh tính đã đăng ký.";
      }
    }

    if (!options.recognize && !options.enroll) {
      outcome.message = "Phát hiện được khuôn mặt trong khung hình.";
    }

    if (options.drawBoxes) {
      String label = "Face";
      if (options.enroll) {
        label = outcome.enrolled ? ("Enrolled: " + outcome.enrolledName) : "Enroll failed";
      } else if (options.recognize) {
        label = outcome.recognized ? outcome.matchedName : "Unknown";
      }

      drawFaceBoxes(&rgbFrame, results, label, outcome.recognized || outcome.enrolled);
    }
  } else {
    if (options.enroll) {
      outcome.ok = false;
      outcome.message = "Không phát hiện được khuôn mặt để đăng ký.";
    } else if (options.recognize) {
      outcome.message = "Không phát hiện được khuôn mặt để nhận diện.";
    } else {
      outcome.message = "Không phát hiện khuôn mặt trong khung hình.";
    }
  }

  outcome.facesJson = buildFacesJson(results, outcome);

  if (!fmt2jpg(rgbBuffer, rgbLength, outcome.width, outcome.height, PIXFORMAT_RGB888, jpegQuality, &outcome.jpegBuffer, &outcome.jpegLength)) {
    free(rgbBuffer);
    outcome.ok = false;
    outcome.error = "Failed to encode processed JPEG frame.";
    return false;
  }

  free(rgbBuffer);
  return true;
}
