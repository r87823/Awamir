import 'package:flutter/material.dart';

import '../api/api_error.dart';

class AsyncStateView<T> extends StatelessWidget {
  const AsyncStateView({
    required this.future,
    required this.builder,
    this.empty,
    super.key,
  });

  final Future<T> future;
  final Widget Function(BuildContext context, T data) builder;
  final Widget? empty;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<T>(
      future: future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return ErrorState(error: snapshot.error);
        }
        final data = snapshot.data;
        if (data == null) {
          return empty ?? const EmptyState(message: 'لا توجد بيانات');
        }
        return builder(context, data);
      },
    );
  }
}

class ErrorState extends StatelessWidget {
  const ErrorState({required this.error, super.key});

  final Object? error;

  @override
  Widget build(BuildContext context) {
    final message = switch (error) {
      ApiException(:final error) => error.supportMessage,
      _ => 'حدث خطأ غير متوقع',
    };
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(message, textAlign: TextAlign.center),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({required this.message, super.key});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(message, textAlign: TextAlign.center),
      ),
    );
  }
}
