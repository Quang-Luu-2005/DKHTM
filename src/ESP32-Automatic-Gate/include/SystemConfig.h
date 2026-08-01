enum general_state {
  state_normal,
  state_always_open,
  state_always_close,
  state_count
};

struct SystemConfig {
    general_state system_state;
    bool rfid;
    bool ultrasonic;
    bool buzzer;
    bool servo;
    bool camera;
    bool led;
    bool violation;

    void normal_run();
    void always_open_run();
    void always_close_run();
    bool is_state_change(SystemConfig new_state);
};

extern SystemConfig g_config;
