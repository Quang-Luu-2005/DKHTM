#pragma once

#include <stdint.h>

enum class GateState : uint8_t {
  CLOSED,
  OPENING,
  HOLDING,
  CLOSING,
};

class GateStateMachine {
 public:
  GateStateMachine(uint32_t travelDurationMs, uint32_t holdDurationMs)
      : travelDurationMs_(travelDurationMs),
        holdDurationMs_(holdDurationMs) {}

  void begin(uint32_t now) {
    state_ = GateState::CLOSED;
    stateStartedAtMs_ = now;
  }

  GateState state() const {
    return state_;
  }

  bool requestOpen(uint32_t now) {
    if (state_ == GateState::HOLDING) {
      // A repeated grant extends the hold window without moving the servo.
      stateStartedAtMs_ = now;
      return false;
    }

    if (state_ == GateState::OPENING) {
      return false;
    }

    transitionTo(GateState::OPENING, now);
    return true;
  }

  bool requestClose(uint32_t now) {
    if (state_ == GateState::CLOSED || state_ == GateState::CLOSING) {
      return false;
    }

    transitionTo(GateState::CLOSING, now);
    return true;
  }

  bool update(uint32_t now) {
    switch (state_) {
      case GateState::OPENING:
        if (elapsed(now) >= travelDurationMs_) {
          transitionTo(GateState::HOLDING, now);
          return true;
        }
        break;

      case GateState::HOLDING:
        if (elapsed(now) >= holdDurationMs_) {
          transitionTo(GateState::CLOSING, now);
          return true;
        }
        break;

      case GateState::CLOSING:
        if (elapsed(now) >= travelDurationMs_) {
          transitionTo(GateState::CLOSED, now);
          return true;
        }
        break;

      case GateState::CLOSED:
        break;
    }

    return false;
  }

  bool isLocked() const {
    return state_ == GateState::CLOSED || state_ == GateState::CLOSING;
  }

  uint32_t remainingHoldMs(uint32_t now) const {
    if (state_ != GateState::HOLDING) {
      return 0;
    }

    const uint32_t elapsedMs = elapsed(now);
    return elapsedMs >= holdDurationMs_ ? 0 : holdDurationMs_ - elapsedMs;
  }

  static const char* name(GateState state) {
    switch (state) {
      case GateState::CLOSED:
        return "CLOSED";
      case GateState::OPENING:
        return "OPENING";
      case GateState::HOLDING:
        return "HOLDING";
      case GateState::CLOSING:
        return "CLOSING";
    }

    return "UNKNOWN";
  }

 private:
  uint32_t elapsed(uint32_t now) const {
    // Unsigned subtraction remains correct when millis() wraps around.
    return now - stateStartedAtMs_;
  }

  void transitionTo(GateState next, uint32_t now) {
    state_ = next;
    stateStartedAtMs_ = now;
  }

  GateState state_ = GateState::CLOSED;
  uint32_t stateStartedAtMs_ = 0;
  const uint32_t travelDurationMs_;
  const uint32_t holdDurationMs_;
};
