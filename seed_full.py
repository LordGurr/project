"""
Full Database Seeder for Bosch Food Store
Loads ALL products from the products.json file.

Usage:
    python seed_full.py
    
Or to load from a JSON file:
    python seed_full.py --file products.json
"""

import json
import sys
from app import app, db
from models import Category, Product, Customer


def get_category_id(name):
    """Auto-categorize products based on name keywords"""
    name_lower = name.lower()
    
    # Drinks (category 2)
    drink_keywords = [
        'cola', 'fanta', 'sprite', 'pepsi', 'monster', 'red bull', 
        'loka', 'ramlösa', 'trocadero', 'zingo', 'festis', 'vitamin well',
        'nocco', 'burn', 'powerking', 'pucko', 'smakis', 'memevatten',
        'dricka', 'soda', 'juice', '33cl', '50cl', 'dew', 'dr.', 'vimto',
        'champis', 'mer ', 'celsius', 'apotekarnes', 'julmust', 'påskmust',
        'zeunerts', 'portello', '7up', 'aqua', 'ice tea', 'smoothie',
        'froosh', 'latitude', 'starbucks', 'espresso', 'energy'
    ]
    if any(x in name_lower for x in drink_keywords):
        return 2
    
    # Frozen food (category 3)
    frozen_keywords = [
        'billys', 'pizza', 'fryst', 'findus', 'felix', 'lasagne',
        'paj', 'asia box', 'dafgård', 'gorby', 'schnitzel', 'biff',
        'kyckling', 'köttbullar', 'pasta', 'grandiosa', 'curry',
        'tacopaj', 'falafel', 'bolognese', 'risotto', 'soppa'
    ]
    if any(x in name_lower for x in frozen_keywords):
        return 3
    
    # Ice cream (category 5)
    icecream_keywords = [
        'glass', 'magnum', 'piggelin', 'strut', 'sia ', 'sandwich glass',
        'tip top', 'daim glass', 'haribo glass', 'split', 'pinne'
    ]
    if any(x in name_lower for x in icecream_keywords):
        return 5
    
    # Chips/Snacks (category 4)
    snack_keywords = [
        'chips', 'olw', 'estrella', 'lantchips', 'doritos', 'pringles',
        'nöt', 'popcorn', 'linschips', 'västkust', 'tuc', 'wasa',
        'sandwich cheese', 'hummus', 'kringla'
    ]
    if any(x in name_lower for x in snack_keywords):
        return 4
    
    # Candy (category 1) - most items
    candy_keywords = [
        'marabou', 'choklad', 'godis', 'kexchoklad', 'daim', 'twix',
        'snickers', 'mars', 'bounty', 'haribo', 'malaco', 'bilar',
        'pingvin', 'dumle', 'geisha', 'fazer', 'kinder', 'lion',
        'kitkat', 'toblerone', 'plopp', 'center', 'japp', 'corny',
        'skittles', 'lakrits', 'lakris', 'viol', 'polly', 'zoo',
        'kick', 'filidutter', 'peacemärke', 'hockeypulver', 'turkisk',
        'tutti frutti', 'ferrero', 'riesen', 'toffifee', 'werther',
        'mentos', 'extra white', 'fisherman', 'dextro', 'refresher',
        'protein bar', 'barebells', 'gainomax', 'njie', 'propud'
    ]
    if any(x in name_lower for x in candy_keywords):
        return 1
    
    return 6  # Other


def create_categories():
    """Create product categories"""
    categories = [
        Category(id=1, name='Candy', description='Chocolate, sweets, and confectionery'),
        Category(id=2, name='Drinks', description='Sodas, energy drinks, and beverages'),
        Category(id=3, name='Frozen Food', description='Frozen meals, pizza, and ready-to-eat'),
        Category(id=4, name='Snacks', description='Chips, nuts, and savory snacks'),
        Category(id=5, name='Ice Cream', description='Ice cream and frozen desserts'),
        Category(id=6, name='Other', description='Miscellaneous items'),
    ]
    
    for cat in categories:
        existing = Category.query.get(cat.id)
        if not existing:
            db.session.add(cat)
    
    db.session.commit()
    return len(categories)


def load_products_from_json(filename):
    """Load products from a JSON file"""
    with open(filename, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return data.get('products', data)


def seed_products(products_data):
    """Insert or update products in the database"""
    created = 0
    updated = 0
    skipped = 0
    
    for item in products_data:
        try:
            # Handle duplicate barcodes by appending ID
            barcode = str(item.get('barcode', ''))
            if not barcode:
                skipped += 1
                continue
            
            existing = Product.query.filter_by(barcode=barcode).first()
            
            if existing:
                # Update existing product
                existing.name = item['name']
                existing.price = item['price']
                existing.stock = item.get('stock', 0)
                existing.active = item.get('active', True)
                if not existing.category_id:
                    existing.category_id = get_category_id(item['name'])
                updated += 1
            else:
                # Create new product
                product = Product(
                    id=item.get('id'),
                    name=item['name'],
                    barcode=barcode,
                    price=item['price'],
                    stock=item.get('stock', 0),
                    active=item.get('active', True),
                    category_id=get_category_id(item['name'])
                )
                db.session.add(product)
                created += 1
                
        except Exception as e:
            print(f"Error processing product {item.get('name', 'unknown')}: {e}")
            skipped += 1
    
    db.session.commit()
    return created, updated, skipped


def create_demo_customer():
    """Create a demo customer account"""
    if not Customer.query.filter_by(email='demo@example.com').first():
        demo = Customer(
            email='demo@example.com',
            first_name='Demo',
            last_name='User',
            address='LTU Campus, Luleå',
            phone='+46701234567'
        )
        demo.set_password('password123')
        db.session.add(demo)
        db.session.commit()
        return True
    return False


def seed_database(json_file=None):
    """Main seeding function"""
    with app.app_context():
        print("=" * 50)
        print("Bosch Food Store - Database Seeder")
        print("=" * 50)
        
        # Create categories
        print("\n1. Creating categories...")
        cat_count = create_categories()
        print(f"   ✓ {cat_count} categories ready")
        
        # Load and seed products
        print("\n2. Loading products...")
        
        if json_file:
            products = load_products_from_json(json_file)
            print(f"   Loaded {len(products)} products from {json_file}")
        else:
            # Use inline sample data for testing
            print("   No JSON file specified, using sample data")
            products = [
                {"active": True, "barcode": "7310511257507", "id": 762, "name": "Daim Dubbel 56g Marabou", "price": 15875, "stock": 36},
                {"active": True, "barcode": "5000112637922", "id": 847, "name": "CocaCola 33cl", "price": 10500, "stock": 48},
                {"active": True, "barcode": "5060335635716", "id": 862, "name": "Monster Energy Ultra Zero White", "price": 20120, "stock": 48},
            ]
        
        print("\n3. Seeding products...")
        created, updated, skipped = seed_products(products)
        print(f"   ✓ Created: {created}")
        print(f"   ✓ Updated: {updated}")
        if skipped:
            print(f"   ⚠ Skipped: {skipped}")
        
        # Create demo customer
        print("\n4. Creating demo customer...")
        if create_demo_customer():
            print("   ✓ Created demo@example.com / password123")
        else:
            print("   ✓ Demo customer already exists")
        
        # Summary
        print("\n" + "=" * 50)
        print("SUMMARY")
        print("=" * 50)
        print(f"Total categories: {Category.query.count()}")
        print(f"Total products:   {Product.query.count()}")
        print(f"Total customers:  {Customer.query.count()}")
        
        # Category breakdown
        print("\nProducts by category:")
        for cat in Category.query.all():
            count = Product.query.filter_by(category_id=cat.id).count()
            print(f"  - {cat.name}: {count}")
        
        print("\n✓ Database seeding complete!")


if __name__ == '__main__':
    json_file = None
    
    if len(sys.argv) > 1:
        if sys.argv[1] == '--file' and len(sys.argv) > 2:
            json_file = sys.argv[2]
        elif not sys.argv[1].startswith('--'):
            json_file = sys.argv[1]
    
    seed_database(json_file)
