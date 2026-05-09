class Environment {
  static const backendBaseUrl = String.fromEnvironment(
    'AWAMIR_API_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );
}
