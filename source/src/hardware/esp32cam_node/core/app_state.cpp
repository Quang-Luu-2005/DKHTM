#include "app_state.h"

WebServer webServer(80);
FaceRecognition112V1S8 recognizer;
HumanFaceDetectMSR01* faceDetectorStageOne = nullptr;
HumanFaceDetectMNP01* faceDetectorStageTwo = nullptr;

unsigned long lastSnapshotTime = 0;
bool cameraReady = false;
bool faceDetectionAvailable = false;
bool faceRecognitionAvailable = false;
bool faceBusy = false;
String lastFaceResultJson;
String faceEngineMessage;
