import 'package:flutter_test/flutter_test.dart';

import 'package:awamir_plus_mobile/main.dart';

void main() {
  testWidgets('shows the Awamir Plus shell', (WidgetTester tester) async {
    await tester.pumpWidget(const AwamirPlusApp());

    expect(find.text('Awamir Plus'), findsWidgets);
    expect(find.text('Independent operations platform'), findsOneWidget);
  });
}
