import 'package:flutter/material.dart';

import 'src/app.dart';
import 'src/di/injection.dart';

void main() {
  configureDependencies();
  runApp(const PosApp());
}
