import 'package:flutter/material.dart';
import 'package:pos/src/data/catalog_repository.dart';
import 'package:pos/src/data/product_summary.dart';
import 'package:pos/src/data/tenant_scope.dart';
import 'package:pos/src/di/injection.dart';

class ProductsPage extends StatefulWidget {
  const ProductsPage({super.key});

  @override
  State<ProductsPage> createState() => _ProductsPageState();
}

class _ProductsPageState extends State<ProductsPage> {
  final TextEditingController _searchController = TextEditingController();
  final ProductCatalogDataRepository _repository =
      getIt<ProductCatalogDataRepository>();
  final TenantScope _scope = const TenantScope(organizationId: 'org-demo');

  List<ProductSummary> _products = const [];
  bool _loading = false;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _load();
    _searchController.addListener(() {
      final q = _searchController.text;
      if (q != _query) {
        setState(() => _query = q);
        _load();
      }
    });
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await _repository.searchProducts(_scope, _query);
      if (!mounted) return;
      setState(() => _products = results);
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Products')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            TextField(
              controller: _searchController,
              decoration: const InputDecoration(
                labelText: 'Search (name, SKU, barcode)',
                prefixIcon: Icon(Icons.search),
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            if (_loading)
              const Expanded(child: Center(child: CircularProgressIndicator()))
            else
              Expanded(
                child: ListView.separated(
                  itemCount: _products.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    final p = _products[i];
                    return ListTile(
                      title: Text(p.name),
                      subtitle: Text(p.sku),
                      trailing: Text(p.isActive ? 'Active' : 'Inactive'),
                    );
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }
}
