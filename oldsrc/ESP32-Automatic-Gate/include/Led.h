struct Led {
  int red_pin;
  int green_pin;

  Led(int red, int green);
  void init();
  void light_red();
  void light_green();
  void no_light();
};