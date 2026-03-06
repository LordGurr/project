"""
Endpoints:
- /api/health - Health check
- /api/categories - Category CRUD
- /api/products - Product CRUD with filtering (barcode search, etc.)
- /api/customers - Customer registration/auth
- /api/cart - Shopping basket operations
- /api/orders - Order placement and management
- /api/reviews - Product reviews and ratings
- /api/admin/* - admin panel for moderation
"""
#
from flask import Flask, request, jsonify
from flask_cors import CORS
from models import db, Category, Product, Customer, Order, OrderItem, CartItem, Review
from functools import wraps
import os
import time
from datetime import datetime,timedelta
app = Flask(__name__)
CORS(app)  # Enable CORS for React frontend
CART_RESERVATION_MINUTES=15
# database configuring
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv(
    'DATABASE_URL',
    'mysql+pymysql://root:root@mariadb:3306/e_commerce_site'
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')

db.init_app(app)

# tables creating on startup
with app.app_context():
    db.create_all()


# helper
def error_response(message, status_code=400):
    """Standard error response format"""
    return jsonify({'error': message}), status_code


def success_response(data, message=None, status_code=200):
    """Standard success response format"""
    response = {'data': data}
    if message:
        response['message'] = message
    return jsonify(response), status_code


# auth decorator
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        customer_id = request.headers.get('X-Customer-ID')
        if not customer_id:
            return error_response('Authentication required', 401)
        customer = Customer.query.get(customer_id)
        if not customer:
            return error_response('Invalid customer', 401)
        request.customer = customer
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    """Admin authentication decorator (role > 0)"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        customer_id = request.headers.get('X-Customer-ID')
        if not customer_id:
            return error_response('Authentication required', 401)
        customer = Customer.query.get(customer_id)
        if not customer:
            return error_response('Invalid customer', 401)
        if customer.role < 1:
            return error_response('Admin access required', 403)
        request.customer = customer
        return f(*args, **kwargs)
    return decorated_function

# release expired reservation

#  health check
@app.route('/')
def index():
    return jsonify({
        'name': 'Bosch Food Store API',
        'description': 'GUSTAV shit show STORE',
        'endpoints': [
            'GET /api/health',
            'GET/POST /api/categories',
            'GET/POST /api/products',
            'GET /api/products/barcode/<barcode>',
            'POST /api/customers/register',
            'POST /api/customers/login',
            'GET/POST/DELETE /api/cart',
            'POST /api/cart/checkout',
            'GET/POST /api/orders',
            'GET/POST /api/reviews'
        ]
    })


@app.route('/api/health')
def health():
    """Health check endpoint"""
    try:
        # Test database connection
        db.session.execute(db.text('SELECT 1'))
        product_count = Product.query.count()
        return jsonify({
            'status': 'healthy',
            'database': 'connected',
            'product_count': product_count
        })
    except Exception as e:
        return jsonify({'status': 'unhealthy', 'database': str(e)}), 500


# catagories
@app.route('/api/categories', methods=['GET'])
def get_categories():
    """Get all categories with product counts"""
    categories = Category.query.all()
    result = []
    for c in categories:
        data = c.to_dict()
        data['product_count'] = len(c.products)
        result.append(data)
    return success_response(result)

@admin_required
@app.route('/api/categories', methods=['POST'])
def create_category():
    """Create a new category"""
    data = request.get_json()
    if not data or not data.get('name'):
        return error_response('Category name is required')

    if Category.query.filter_by(name=data['name']).first():
        return error_response('Category already exists')

    category = Category(
        name=data['name'],
        description=data.get('description')
    )
    db.session.add(category)
    db.session.commit()

    return success_response(category.to_dict(), 'Category created', 201)

@admin_required
@app.route('/api/categories/<int:category_id>', methods=['PUT'])
def update_category(category_id):
    """Update a category"""
    category = Category.query.get_or_404(category_id)
    data = request.get_json()

    # update fields
    for field in ['name', 'description']:
        if field in data:
            setattr(category, field, data[field])

    db.session.commit()
    return success_response(category.to_dict(), 'Category updated')

@admin_required
@app.route('/api/categories/<int:category_id>', methods=['DELETE'])
def delete_category(category_id):
    """Delete a category"""
    category = Category.query.get_or_404(category_id)

    # Prevent deleting if products exist
    if category.products:
        return error_response('Cannot delete category with products')

    db.session.delete(category)
    db.session.commit()

    return success_response(None, 'Category deleted')

@app.route('/api/categories/<int:category_id>', methods=['GET'])
def get_category(category_id):
    """Get a single category with its products"""
    category = Category.query.get_or_404(category_id)
    data = category.to_dict()
    data['products'] = [p.to_dict() for p in category.products if p.active]
    return success_response(data)


# products
@app.route('/api/products', methods=['GET'])
def get_products():
    """
    Get products with  filters
    Query params: category_id, active, in_stock, min_price, max_price, search, barcode
    """
    query = Product.query

    # apply filters
    if request.args.get('category_id'):
        query = query.filter_by(category_id=request.args.get('category_id', type=int))

    if request.args.get('active') is not None:
        active = request.args.get('active').lower() == 'true'
        query = query.filter_by(active=active)

    if request.args.get('in_stock') == 'true':
        query = query.filter(Product.stock > 0)

    if request.args.get('min_price'):
        query = query.filter(Product.price >= request.args.get('min_price', type=int))

    if request.args.get('max_price'):
        query = query.filter(Product.price <= request.args.get('max_price', type=int))

    # search name
    if request.args.get('search'):
        search = f"%{request.args.get('search')}%"
        query = query.filter(Product.name.ilike(search))

    # search barcode
    if request.args.get('barcode'):
        barcode = f"%{request.args.get('barcode')}%"
        query = query.filter(Product.barcode.ilike(barcode))

    # pagies with max 200 per page
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    per_page = min(per_page, 200)

    # order by name
    query = query.order_by(Product.name)

    # page results
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return success_response({
        'products': [p.to_dict() for p in pagination.items],
        'total': pagination.total,
        'page': page,
        'per_page': per_page,
        'pages': pagination.pages
    })


@app.route('/api/products/<int:product_id>', methods=['GET'])
def get_product(product_id):
    """Get a single product with reviews"""
    product = Product.query.get_or_404(product_id)
    return success_response(product.to_dict(include_reviews=True))


@app.route('/api/products/barcode/<barcode>', methods=['GET'])
def get_product_by_barcode(barcode):
    """Get a product by its barcode (exact match)"""
    product = Product.query.filter_by(barcode=barcode).first()
    if not product:
        return error_response('Product not found', 404)
    return success_response(product.to_dict(include_reviews=True))

@admin_required
@app.route('/api/products', methods=['POST'])
def create_product():
    """Create a new product"""
    data = request.get_json()

    required_fields = ['name', 'barcode', 'price']
    for field in required_fields:
        if field not in data:
            return error_response(f'{field} is required')
    product = Product(
        name=data['name'],
        barcode=data['barcode'],
        price=data['price'],
        stock=data.get('stock', 0),
        active=data.get('active', True),
        category_id=data.get('category_id'),
        image_url=data.get('image_url')
    )
    db.session.add(product)
    db.session.commit()

    return success_response(product.to_dict(), 'Product created', 201)


@app.route('/api/products/<int:product_id>', methods=['PUT'])
def update_product(product_id):
    """Update a product"""
    product = Product.query.get_or_404(product_id)
    data = request.get_json()

    # update fields
    for field in ['name', 'barcode', 'price', 'stock', 'active', 'category_id', 'image_url']:
        if field in data:
            setattr(product, field, data[field])

    db.session.commit()
    return success_response(product.to_dict(), 'Product updated')


@app.route('/api/products/<int:product_id>', methods=['DELETE'])
def delete_product(product_id):
    """Delete a product (or set inactive)"""
    product = Product.query.get_or_404(product_id)

    # soft deletion
    if request.args.get('hard') == 'true':
        db.session.delete(product)
    else:
        product.active = False

    db.session.commit()
    return success_response(None, 'Product deleted')

# for scraping
@app.route('/api/products/bulk', methods=['POST'])
def bulk_create_products():
    """Bulk create/update products from JSON array"""
    data = request.get_json()

    if not data or not isinstance(data.get('products'), list):
        return error_response('products array is required')

    created = 0
    updated = 0
    errors = []

    for item in data['products']:
        try:
            existing = Product.query.filter_by(barcode=item.get('barcode')).first()

            if existing:
                # Update existing
                existing.name = item.get('name', existing.name)
                existing.price = item.get('price', existing.price)
                existing.stock = item.get('stock', existing.stock)
                existing.active = item.get('active', existing.active)
                updated += 1
            else:
                # Create new
                product = Product(
                    id=item.get('id'),
                    name=item['name'],
                    barcode=item['barcode'],
                    price=item['price'],
                    stock=item.get('stock', 0),
                    active=item.get('active', True)
                )
                db.session.add(product)
                created += 1
        except Exception as e:
            errors.append({'barcode': item.get('barcode'), 'error': str(e)})

    db.session.commit()

    return success_response({
        'created': created,
        'updated': updated,
        'errors': errors
    }, f'Processed {created + updated} products')


# customer
@app.route('/api/customers/register', methods=['POST'])
def register_customer():
    """Register a new customer"""
    data = request.get_json()

    if not data.get('email') or not data.get('password'):
        return error_response('Email and password are required')

    if Customer.query.filter_by(email=data['email']).first():
        return error_response('Email already registered')

    customer = Customer(
        email=data['email'],
        first_name=data.get('first_name'),
        last_name=data.get('last_name'),
        address=data.get('address'),
        phone=data.get('phone')
    )
    customer.set_password(data['password'])

    db.session.add(customer)
    db.session.commit()

    return success_response(customer.to_dict(), 'Registration successful', 201)


@app.route('/api/customers/login', methods=['POST'])
def login_customer():
    """Login"""
    data = request.get_json()

    # if not data.get('email') or not data.get('password'):
        #return error_response('Email and password are required')

    customer = Customer.query.filter_by(email=data['email']).first()

    if not customer or not customer.check_password(data['password']):
        return error_response('Invalid email or password', 401)
    return success_response({
        'customer_id': customer.id,
        'customer': customer.to_dict()
    }, 'Login successful')


@app.route('/api/customers/me', methods=['GET'])
@login_required
def get_current_customer():
    """Get current customer's profile"""
    return success_response(request.customer.to_dict())



# shopping cart
@app.route('/api/cart', methods=['GET'])
@login_required
def get_cart():
    """Get current customer's cart"""
    cart_items = CartItem.query.filter_by(customer_id=request.customer.id).all()
    total = sum(item.product.price * item.quantity for item in cart_items if item.product)

    return success_response({
        'items': [item.to_dict() for item in cart_items],
        'total': total,
        'total_kr': total / 100,
        'item_count': sum(item.quantity for item in cart_items)
    })


@app.route('/api/cart', methods=['POST'])
@login_required
def add_to_cart():
    """
    Add item to cart by product_id or barcode NOTE: not reserved just reserved on checkout
    """
    data = request.get_json()

    # Find product by ID or barcode
    product = None
    if data.get('product_id'):
        product = Product.query.get(data['product_id'])
    elif data.get('barcode'):
        product = Product.query.filter_by(barcode=data['barcode']).first()

    if not product:
        return error_response('Product not found', 404)

    if not product.active:
        return error_response('Product is not available')

    quantity = data.get('quantity', 1)

    # Check if item already in cart
    cart_item = CartItem.query.filter_by(
        customer_id=request.customer.id,
        product_id=product.id
    ).first()

    if cart_item:
        cart_item.quantity += quantity
    else:
        cart_item = CartItem(
            customer_id=request.customer.id,
            product_id=product.id,
            quantity=quantity
        )
        db.session.add(cart_item)

    db.session.commit()
    return success_response(cart_item.to_dict(), 'Added to cart')


@app.route('/api/cart/<int:item_id>', methods=['PUT'])
@login_required
def update_cart_item(item_id):
    """Update cart item quantity"""
    cart_item = CartItem.query.filter_by(
        id=item_id,
        customer_id=request.customer.id
    ).first_or_404()

    data = request.get_json()
    quantity = data.get('quantity', 1)

    if quantity <= 0:
        db.session.delete(cart_item)
        db.session.commit()
        return success_response(None, 'Item removed from cart')

    cart_item.quantity = quantity
    db.session.commit()
    return success_response(cart_item.to_dict(), 'Cart updated')


@app.route('/api/cart/<int:item_id>', methods=['DELETE'])
@login_required
def remove_from_cart(item_id):
    """Remove item from cart"""
    cart_item = CartItem.query.filter_by(
        id=item_id,
        customer_id=request.customer.id
    ).first_or_404()

    db.session.delete(cart_item)
    db.session.commit()
    return success_response(None, 'Item removed from cart')


@app.route('/api/cart/clear', methods=['DELETE'])
@login_required
def clear_cart():
    """Clear cart and release all reservations"""
    cart_items = CartItem.query.filter_by(customer_id=request.customer.id).all()

    for item in cart_items:
        if item.product and item.reserved_quantity > 0:
            item.product.release_stock(item.reserved_quantity)
        db.session.delete(item)

    db.session.commit()
    return success_response(None, 'Cart cleared, all stock released')

@app.route('/api/cart/extend', methods=['POST'])
@login_required
def extend_reservations():
    """Extend all cart reservations"""
    cart_items = CartItem.query.filter_by(customer_id=request.customer.id).all()

    for item in cart_items:
        item.reserved_until = datetime.utcnow() + timedelta(minutes=CART_RESERVATION_MINUTES)

    db.session.commit()
    return success_response({
        'items_extended': len(cart_items),
        'new_expiry': (datetime.utcnow() + timedelta(minutes=CART_RESERVATION_MINUTES)).isoformat()
    })
@app.route('/api/cart/checkout', methods=['POST'])
@login_required
def checkout():
    """Convert cart to order - confirms reserved stock"""
    cart_items = CartItem.query.filter_by(customer_id=request.customer.id).all()

    if not cart_items:
        return error_response('Cart is empty')

    # Verify all items still have valid reservations or available stock
    errors = []
    for item in cart_items:
        if not item.product.active:
            errors.append(f'{item.product.name} is no longer available')
        elif item.reserved_quantity < item.quantity:
            # Some reservation expired, check if stock available
            errors.append(f"Reservation expired")
            needed = item.quantity - item.reserved_quantity
            if item.product.stock < needed:
                errors.append(
                    f'{item.product.name}: reservation expired, only {item.product.stock + item.reserved_quantity} available'
                )

    if errors:
        return error_response(errors, 400)

    # Calculate total
    total = sum(item.product.price * item.quantity for item in cart_items)

    # Get shipping address from request or use customer's default
    data = request.get_json() or {}
    shipping_address = data.get('shipping_address') or request.customer.address

    # Create order
    order = Order(
        customer_id=request.customer.id,
        total_amount=total,
        shipping_address=shipping_address,
        status='confirmed'
    )
    db.session.add(order)
    db.session.flush()  # Get order ID

    # Create order items and confirm reservations
    for cart_item in cart_items:
        order_item = OrderItem(
            order_id=order.id,
            product_id=cart_item.product_id,
            quantity=cart_item.quantity,
            price_at_purchase=cart_item.product.price
        )
        db.session.add(order_item)

        # Confirm the reservation (removes from reserved_stock)
        cart_item.product.confirm_reservation(cart_item.reserved_quantity)

        # If we need more than reserved (reservation partially expired)
        extra_needed = cart_item.quantity - cart_item.reserved_quantity
        if extra_needed > 0:
            cart_item.product.stock -= extra_needed

        # Remove from cart
        db.session.delete(cart_item)

    db.session.commit()

    return success_response(order.to_dict(), 'Order placed successfully', 201)


# orders
@app.route('/api/orders', methods=['GET'])
@login_required
def get_orders():
    """Get current customer's orders"""
    orders = Order.query.filter_by(customer_id=request.customer.id)\
        .order_by(Order.created_at.desc()).all()
    return success_response([o.to_dict() for o in orders])


@app.route('/api/orders/<int:order_id>', methods=['GET'])
@login_required
def get_order(order_id):
    """Get a specific order"""
    order = Order.query.filter_by(
        id=order_id,
        customer_id=request.customer.id
    ).first_or_404()
    return success_response(order.to_dict())


# reviews
@app.route('/api/products/<int:product_id>/reviews', methods=['GET'])
def get_product_reviews(product_id):
    """Get all reviews for a product (only top-level, replies nested)"""
    product = Product.query.get_or_404(product_id)
    # Only get top-level reviews (no parent)
    reviews = Review.query.filter_by(product_id=product_id, parent_id=None)\
        .order_by(Review.created_at.desc()).all()
    return success_response([r.to_dict() for r in reviews])


@app.route('/api/reviews/<int:review_id>', methods=['DELETE'])
@admin_required
def delete_review(review_id):
    """Admin delete review"""
    review = Review.query.get_or_404(review_id)

    db.session.delete(review)
    db.session.commit()

    return success_response(None, 'Review deleted')

@app.route('/api/products/<int:product_id>/reviews', methods=['POST'])
@login_required
def create_review(product_id):
    """Create a review for a product"""
    product = Product.query.get_or_404(product_id)
    data = request.get_json()

    if not data.get('rating'):
        return error_response('Rating is required')

    rating = data['rating']
    if not isinstance(rating, int) or rating < 1 or rating > 5:
        return error_response('Rating must be an integer between 1 and 5')

    # check if review has already been done
    if not data.get('parent_id'):
        existing = Review.query.filter_by(
            product_id=product_id,
            customer_id=request.customer.id,
            parent_id=None
        ).first()
        if existing:
            return error_response('You have already reviewed this product')

    review = Review(
        product_id=product_id,
        customer_id=request.customer.id,
        rating=rating,
        title=data.get('title'),
        comment=data.get('comment'),
        parent_id=data.get('parent_id')  # For replies
    )
    db.session.add(review)
    db.session.commit()

    return success_response(review.to_dict(), 'Review submitted', 201)

#admin

@app.route('/api/admin/reviews', methods=['GET'])
@admin_required
def admin_get_reviews():
    """Get all reviews for moderation"""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    query = Review.query.order_by(Review.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    reviews = []
    for r in pagination.items:
        data = r.to_dict(include_replies=False)
        data['product_name'] = r.product.name if r.product else None
        data['customer_email'] = r.customer.email if r.customer else None
        reviews.append(data)

    return success_response({
        'reviews': reviews,
        'total': pagination.total,
        'page': page,
        'pages': pagination.pages
    })


@app.route('/api/admin/reviews/<int:review_id>', methods=['DELETE'])
@admin_required
def admin_delete_review(review_id):
    """Delete a review (admin only)"""
    review = Review.query.get_or_404(review_id)
    db.session.delete(review)
    db.session.commit()
    return success_response(None, 'Review deleted')


@app.route('/api/admin/customers', methods=['GET'])
@admin_required
def admin_get_customers():
    """Get all customers (admin only)"""
    customers = Customer.query.order_by(Customer.created_at.desc()).all()
    return success_response([c.to_dict() for c in customers])
# error handling
@app.errorhandler(404)
def not_found(e):
    return error_response('Resource not found', 404)


@app.errorhandler(500)
def server_error(e):
    return error_response(f'Internal server error: {e}', 500)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
