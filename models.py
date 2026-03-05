"""
Tables:
- Category: Product categories (e.g., Candy, Drinks, Frozen Food)
- Product: Food items with stock tracking and barcode
- Customer: User accounts
- Order: Customer orders
- OrderItem: Individual items in an order (many-to-many)
- CartItem: Shopping basket items
- Review: Product ratings and comments
"""

from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()


class Category(db.Model):
    """Product categories for organizing food items"""
    __tablename__ = 'categories'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationship
    products = db.relationship('Product', backref='category', lazy=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description
        }


class Product(db.Model):
    """Food/snack products - matches your existing data structure"""
    __tablename__ = 'products'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    barcode = db.Column(db.String(100), unique=True, nullable=False)
    price = db.Column(db.Integer, db.CheckConstraint('price >= 0'), nullable=False)  # Price in öre (cents), e.g., 1000 = 10.00 kr
    stock = db.Column(db.Integer, db.CheckConstraint('stock >= 0'), default=0)
    active = db.Column(db.Boolean, default=True)
    category_id = db.Column(db.Integer, db.ForeignKey('categories.id'), nullable=True)
    image_url = db.Column(db.String(500))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    reviews = db.relationship('Review', backref='product', lazy=True, cascade='all, delete-orphan')
    order_items = db.relationship('OrderItem', backref='product', lazy=True)
    cart_items = db.relationship('CartItem', backref='product', lazy=True, cascade='all, delete-orphan')
    
    def to_dict(self, include_reviews=False):
        data = {
            'id': self.id,
            'name': self.name,
            'barcode': self.barcode,
            'price': self.price,  # In öre
            'price_kr': self.price / 100,  # Converted to kronor for display
            'stock': self.stock,
            'active': self.active,
            'category_id': self.category_id,
            'category_name': self.category.name if self.category else None,
            'image_url': self.image_url,
            'average_rating': self.average_rating,
            'review_count': len(self.reviews)
        }
        if include_reviews:
            data['reviews'] = [r.to_dict() for r in self.reviews]
        return data
    
    @property
    def average_rating(self):
        if not self.reviews:
            return None
        return round(sum(r.rating for r in self.reviews) / len(self.reviews), 1)
    
    @property
    def in_stock(self):
        return self.stock > 0


class Customer(db.Model):
    """Customer accounts"""
    __tablename__ = 'customers'
    
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), nullable=False, unique=True)
    password_hash = db.Column(db.String(255), nullable=False)
    first_name = db.Column(db.String(100))
    last_name = db.Column(db.String(100))
    address = db.Column(db.Text)
    phone = db.Column(db.String(20))
    role = db.Column(db.Integer, default=0) # 0:user, 1: admin, 2: system
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    orders = db.relationship('Order', backref='customer', lazy=True)
    cart_items = db.relationship('CartItem', backref='customer', lazy=True, cascade='all, delete-orphan')
    reviews = db.relationship('Review', backref='customer', lazy=True)
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'first_name': self.first_name,
            'last_name': self.last_name,
            'address': self.address,
            'phone': self.phone
        }


class Order(db.Model):
    """Customer orders"""
    __tablename__ = 'orders'
    
    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey('customers.id'), nullable=False)
    status = db.Column(db.String(50), default='pending')  # pending, confirmed, shipped, delivered, cancelled
    total_amount = db.Column(db.Integer, nullable=False)  # In öre
    shipping_address = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    items = db.relationship('OrderItem', backref='order', lazy=True, cascade='all, delete-orphan')
    
    def to_dict(self, include_items=True):
        data = {
            'id': self.id,
            'customer_id': self.customer_id,
            'status': self.status,
            'total_amount': self.total_amount,
            'total_amount_kr': self.total_amount / 100,
            'shipping_address': self.shipping_address,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
        if include_items:
            data['items'] = [item.to_dict() for item in self.items]
        return data


class OrderItem(db.Model):
    """Individual items in an order (order-product junction table)"""
    __tablename__ = 'order_items'
    
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey('orders.id'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    price_at_purchase = db.Column(db.Integer, nullable=False)  # Snapshot of price when ordered (öre)
    
    def to_dict(self):
        return {
            'id': self.id,
            'product_id': self.product_id,
            'product_name': self.product.name if self.product else None,
            'barcode': self.product.barcode if self.product else None,
            'quantity': self.quantity,
            'price_at_purchase': self.price_at_purchase,
            'price_at_purchase_kr': self.price_at_purchase / 100,
            'subtotal': self.price_at_purchase * self.quantity,
            'subtotal_kr': (self.price_at_purchase * self.quantity) / 100
        }


class CartItem(db.Model):
    """Shopping basket items"""
    __tablename__ = 'cart_items'
    
    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey('customers.id'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False)
    quantity = db.Column(db.Integer, nullable=False, default=1)
    added_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Unique constraint: one product per customer in cart
    __table_args__ = (db.UniqueConstraint('customer_id', 'product_id', name='unique_cart_item'),)
    
    def to_dict(self):
        return {
            'id': self.id,
            'product_id': self.product_id,
            'product': self.product.to_dict() if self.product else None,
            'quantity': self.quantity,
            'subtotal': (self.product.price * self.quantity) if self.product else 0,
            'subtotal_kr': (self.product.price * self.quantity) / 100 if self.product else 0
        }


class Review(db.Model):
    """Product reviews and ratings"""
    __tablename__ = 'reviews'
    
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False)
    customer_id = db.Column(db.Integer, db.ForeignKey('customers.id'), nullable=False)
    rating = db.Column(db.Integer, nullable=False)  # 1-5 stars
    title = db.Column(db.String(200))
    comment = db.Column(db.Text)
    parent_id = db.Column(db.Integer, db.ForeignKey('reviews.id'))  # For reply threads
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Self-referential relationship for comment threads
    replies = db.relationship('Review', backref=db.backref('parent', remote_side=[id]), lazy=True)
    
    def to_dict(self, include_replies=True):
        data = {
            'id': self.id,
            'product_id': self.product_id,
            'customer_id': self.customer_id,
            'customer_name': f"{self.customer.first_name} {self.customer.last_name}" if self.customer else "Anonymous",
            'rating': self.rating,
            'title': self.title,
            'comment': self.comment,
            'created_at': self.created_at.isoformat()
        }
        if include_replies and self.replies:
            data['replies'] = [r.to_dict(include_replies=True) for r in self.replies]
        return data
