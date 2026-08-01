struct Ultrasonic {
  int trig_pin;
  int echo_pin;

  Ultrasonic(int trig, int echo);
  void init();
  int get_distance(); 
  bool is_violate();
};