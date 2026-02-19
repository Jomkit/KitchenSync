from urllib.parse import urlsplit, urlunsplit

from sqlalchemy import select

from app.models import Base, Ingredient, MenuItem, Recipe, User
from config import settings
from db import SessionLocal, create_all, engine


def _redacted_database_url(database_url: str) -> str:
    parsed = urlsplit(database_url)
    if parsed.username is None:
        return database_url

    host = parsed.hostname or ""
    port = f":{parsed.port}" if parsed.port else ""
    username = parsed.username
    redacted_netloc = f"{username}:***@{host}{port}"
    return urlunsplit((parsed.scheme, redacted_netloc, parsed.path, parsed.query, parsed.fragment))


def _get_or_create_user(
    email: str,
    password: str,
    role: str,
    display_name: str | None = None,
) -> User:
    with SessionLocal() as session:
        existing = session.execute(select(User).where(User.email == email)).scalar_one_or_none()
        if existing:
            existing.password = password
            existing.role = role
            existing.display_name = display_name
            session.commit()
            session.refresh(existing)
            return existing

        user = User(email=email, password=password, role=role, display_name=display_name)
        session.add(user)
        session.commit()
        session.refresh(user)
        return user


def _get_or_create_ingredient(
    name: str,
    on_hand_qty: int,
    low_stock_threshold_qty: int,
    is_out: bool = False,
) -> Ingredient:
    with SessionLocal() as session:
        existing = session.execute(
            select(Ingredient).where(Ingredient.name == name)
        ).scalar_one_or_none()
        if existing:
            existing.on_hand_qty = on_hand_qty
            existing.low_stock_threshold_qty = low_stock_threshold_qty
            existing.is_out = is_out
            session.commit()
            session.refresh(existing)
            return existing

        ingredient = Ingredient(
            name=name,
            on_hand_qty=on_hand_qty,
            low_stock_threshold_qty=low_stock_threshold_qty,
            is_out=is_out,
        )
        session.add(ingredient)
        session.commit()
        session.refresh(ingredient)
        return ingredient


def _get_or_create_menu_item(
    name: str,
    price_cents: int,
    category: str | None = None,
    allergens: str | None = None,
) -> MenuItem:
    with SessionLocal() as session:
        existing = session.execute(select(MenuItem).where(MenuItem.name == name)).scalar_one_or_none()
        if existing:
            existing.price_cents = price_cents
            existing.category = category
            existing.allergens = allergens
            session.commit()
            session.refresh(existing)
            return existing

        item = MenuItem(
            name=name,
            price_cents=price_cents,
            category=category,
            allergens=allergens,
        )
        session.add(item)
        session.commit()
        session.refresh(item)
        return item


def _get_or_create_recipe(menu_item_id: int, ingredient_id: int, qty_required: int) -> Recipe:
    with SessionLocal() as session:
        existing = session.execute(
            select(Recipe).where(
                Recipe.menu_item_id == menu_item_id,
                Recipe.ingredient_id == ingredient_id,
            )
        ).scalar_one_or_none()
        if existing:
            existing.qty_required = qty_required
            session.commit()
            session.refresh(existing)
            return existing

        recipe = Recipe(
            menu_item_id=menu_item_id,
            ingredient_id=ingredient_id,
            qty_required=qty_required,
        )
        session.add(recipe)
        session.commit()
        session.refresh(recipe)
        return recipe


def seed() -> None:
    print(
        "Seeding database",
        f"env={settings.app_env}",
        f"url={_redacted_database_url(settings.database_url)}",
    )
    Base.metadata.drop_all(bind=engine)
    create_all()

    _get_or_create_user(
        "kitchen@example.com",
        password="pass",
        role="kitchen",
        display_name="Kitchen",
    )
    _get_or_create_user(
        "foh@example.com",
        password="pass",
        role="foh",
        display_name="Front Of House",
    )
    _get_or_create_user(
        "online@example.com",
        password="pass",
        role="online",
        display_name="Online",
    )

    ingredient_specs = [
        ("Sesame Bun", 130, 25, False),
        ("Brioche Bun", 90, 20, False),
        ("Gluten-Free Bun", 25, 8, False),
        ("Flour Tortilla", 90, 20, False),
        ("Sourdough Bread", 70, 15, False),
        ("Romaine Lettuce", 80, 20, False),
        ("Mixed Greens", 70, 20, False),
        ("Tomato", 110, 20, False),
        ("Red Onion", 90, 15, False),
        ("Pickles", 120, 20, False),
        ("Cucumber", 70, 15, False),
        ("Black Olives", 50, 12, False),
        ("Mushrooms", 65, 15, False),
        ("Jalapenos", 45, 10, False),
        ("Avocado", 40, 12, False),
        ("Lemon", 35, 10, False),
        ("Beef Patty", 120, 24, False),
        ("Veggie Patty", 50, 12, False),
        ("Chicken Breast", 100, 20, False),
        ("Crispy Chicken Filet", 85, 18, False),
        ("Fish Fillet", 45, 12, False),
        ("Turkey Slices", 55, 12, False),
        ("Bacon", 80, 16, False),
        ("Steak Strips", 55, 12, False),
        ("Egg", 120, 24, False),
        ("Breakfast Sausage", 45, 10, False),
        ("Cheddar Cheese", 110, 20, False),
        ("Swiss Cheese", 80, 16, False),
        ("American Cheese", 100, 20, False),
        ("Parmesan Cheese", 55, 12, False),
        ("Feta Cheese", 45, 10, False),
        ("Mozzarella Cheese", 70, 14, False),
        ("Rice", 120, 25, False),
        ("Fries Portion", 220, 45, False),
        ("Onion Rings Portion", 80, 16, False),
        ("Chicken Tenders Portion", 75, 15, False),
        ("Mac Pasta", 85, 20, False),
        ("Cheese Sauce", 70, 15, False),
        ("Tomato Soup Base", 65, 15, False),
        ("Chili Base", 60, 12, False),
        ("Croutons", 75, 15, False),
        ("Black Beans", 55, 12, False),
        ("Caesar Dressing", 60, 12, False),
        ("Ranch Dressing", 70, 14, False),
        ("Tzatziki Sauce", 45, 10, False),
        ("Mayo", 85, 16, False),
        ("Ketchup", 100, 20, False),
        ("Mustard", 80, 16, False),
        ("BBQ Sauce", 70, 14, False),
        ("Buffalo Sauce", 65, 12, False),
    ]

    ingredients_by_name: dict[str, Ingredient] = {}
    for name, on_hand_qty, low_stock_threshold_qty, is_out in ingredient_specs:
        ingredients_by_name[name] = _get_or_create_ingredient(
            name=name,
            on_hand_qty=on_hand_qty,
            low_stock_threshold_qty=low_stock_threshold_qty,
            is_out=is_out,
        )

    menu_specs = [
        ("Classic Burger", 1299, "Burgers", "gluten,egg"),
        ("Cheeseburger", 1399, "Burgers", "gluten,dairy,egg"),
        ("Bacon Burger", 1549, "Burgers", "gluten,dairy,egg"),
        ("Mushroom Swiss Burger", 1599, "Burgers", "gluten,dairy,egg"),
        ("BBQ Burger", 1599, "Burgers", "gluten,egg"),
        ("Double Smash Burger", 1799, "Burgers", "gluten,dairy,egg"),
        ("Veggie Burger", 1299, "Burgers", "gluten"),
        ("Crispy Chicken Sandwich", 1399, "Sandwiches", "gluten,egg"),
        ("Grilled Chicken Sandwich", 1499, "Sandwiches", "gluten,egg"),
        ("Buffalo Chicken Sandwich", 1499, "Sandwiches", "gluten,dairy,egg"),
        ("Fish Sandwich", 1499, "Sandwiches", "gluten,egg"),
        ("Turkey Club", 1399, "Sandwiches", "gluten,egg"),
        ("BLT Sandwich", 1299, "Sandwiches", "gluten,egg"),
        ("Caesar Salad", 1199, "Salads", "dairy,fish,gluten"),
        ("Garden Salad", 1099, "Salads", None),
        ("Greek Salad", 1249, "Salads", "dairy"),
        ("Chicken Caesar Wrap", 1399, "Wraps", "gluten,dairy,fish"),
        ("Veggie Wrap", 1249, "Wraps", "gluten"),
        ("Steak Rice Bowl", 1599, "Bowls", None),
        ("Chicken Rice Bowl", 1499, "Bowls", None),
        ("Loaded Fries", 1099, "Sides", "dairy"),
        ("Truffle Fries", 1199, "Sides", "dairy"),
        ("Onion Rings", 899, "Sides", "gluten"),
        ("Mozzarella Sticks", 999, "Sides", "gluten,dairy"),
        ("Mac and Cheese", 1099, "Sides", "gluten,dairy"),
        ("Tomato Soup", 899, "Soups", "dairy"),
        ("Chili Bowl", 1199, "Soups", None),
        ("Kids Cheeseburger", 899, "Kids", "gluten,dairy,egg"),
        ("Kids Chicken Tenders", 899, "Kids", "gluten"),
        ("Breakfast Burrito", 1299, "Breakfast", "gluten,dairy"),
    ]

    if len(menu_specs) != 30:
        raise RuntimeError(f"Expected exactly 30 menu items, got {len(menu_specs)}")

    menu_by_name: dict[str, MenuItem] = {}
    for name, price_cents, category, allergens in menu_specs:
        menu_by_name[name] = _get_or_create_menu_item(
            name=name,
            price_cents=price_cents,
            category=category,
            allergens=allergens,
        )

    recipe_specs = {
        "Classic Burger": [("Sesame Bun", 1), ("Beef Patty", 1), ("Romaine Lettuce", 1), ("Tomato", 1), ("Red Onion", 1), ("Pickles", 1), ("Mayo", 1)],
        "Cheeseburger": [("Sesame Bun", 1), ("Beef Patty", 1), ("American Cheese", 1), ("Pickles", 1), ("Ketchup", 1), ("Mustard", 1)],
        "Bacon Burger": [("Brioche Bun", 1), ("Beef Patty", 1), ("Cheddar Cheese", 1), ("Bacon", 2), ("Romaine Lettuce", 1), ("Tomato", 1), ("Mayo", 1)],
        "Mushroom Swiss Burger": [("Brioche Bun", 1), ("Beef Patty", 1), ("Mushrooms", 2), ("Swiss Cheese", 1), ("Romaine Lettuce", 1), ("Mayo", 1)],
        "BBQ Burger": [("Sesame Bun", 1), ("Beef Patty", 1), ("Bacon", 1), ("Onion Rings Portion", 1), ("BBQ Sauce", 1)],
        "Double Smash Burger": [("Sesame Bun", 1), ("Beef Patty", 2), ("American Cheese", 2), ("Pickles", 1), ("Ketchup", 1), ("Mustard", 1)],
        "Veggie Burger": [("Gluten-Free Bun", 1), ("Veggie Patty", 1), ("Romaine Lettuce", 1), ("Tomato", 1), ("Red Onion", 1), ("Mayo", 1)],
        "Crispy Chicken Sandwich": [("Brioche Bun", 1), ("Crispy Chicken Filet", 1), ("Pickles", 1), ("Ranch Dressing", 1)],
        "Grilled Chicken Sandwich": [("Sesame Bun", 1), ("Chicken Breast", 1), ("Romaine Lettuce", 1), ("Tomato", 1), ("Mayo", 1)],
        "Buffalo Chicken Sandwich": [("Brioche Bun", 1), ("Crispy Chicken Filet", 1), ("Buffalo Sauce", 1), ("Ranch Dressing", 1), ("Romaine Lettuce", 1)],
        "Fish Sandwich": [("Sesame Bun", 1), ("Fish Fillet", 1), ("Romaine Lettuce", 1), ("Tomato", 1), ("Tzatziki Sauce", 1)],
        "Turkey Club": [("Sourdough Bread", 2), ("Turkey Slices", 2), ("Bacon", 2), ("Romaine Lettuce", 1), ("Tomato", 1), ("Mayo", 1)],
        "BLT Sandwich": [("Sourdough Bread", 2), ("Bacon", 2), ("Romaine Lettuce", 1), ("Tomato", 1), ("Mayo", 1)],
        "Caesar Salad": [("Romaine Lettuce", 3), ("Parmesan Cheese", 1), ("Croutons", 1), ("Caesar Dressing", 1), ("Chicken Breast", 1)],
        "Garden Salad": [("Mixed Greens", 3), ("Tomato", 1), ("Cucumber", 1), ("Red Onion", 1)],
        "Greek Salad": [("Mixed Greens", 2), ("Tomato", 1), ("Cucumber", 1), ("Red Onion", 1), ("Black Olives", 1), ("Feta Cheese", 1), ("Lemon", 1)],
        "Chicken Caesar Wrap": [("Flour Tortilla", 1), ("Chicken Breast", 1), ("Romaine Lettuce", 1), ("Parmesan Cheese", 1), ("Caesar Dressing", 1)],
        "Veggie Wrap": [("Flour Tortilla", 1), ("Veggie Patty", 1), ("Mixed Greens", 1), ("Tomato", 1), ("Cucumber", 1), ("Tzatziki Sauce", 1)],
        "Steak Rice Bowl": [("Steak Strips", 1), ("Rice", 2), ("Mixed Greens", 1), ("Tomato", 1), ("Red Onion", 1)],
        "Chicken Rice Bowl": [("Chicken Breast", 1), ("Rice", 2), ("Mixed Greens", 1), ("Tomato", 1), ("Cucumber", 1)],
        "Loaded Fries": [("Fries Portion", 2), ("Cheddar Cheese", 1), ("Bacon", 1), ("Jalapenos", 1), ("Ranch Dressing", 1)],
        "Truffle Fries": [("Fries Portion", 2), ("Parmesan Cheese", 1), ("Mayo", 1)],
        "Onion Rings": [("Onion Rings Portion", 1), ("Ranch Dressing", 1)],
        "Mozzarella Sticks": [("Mozzarella Cheese", 2), ("Tomato Soup Base", 1)],
        "Mac and Cheese": [("Mac Pasta", 2), ("Cheese Sauce", 2), ("Cheddar Cheese", 1)],
        "Tomato Soup": [("Tomato Soup Base", 2), ("Parmesan Cheese", 1)],
        "Chili Bowl": [("Chili Base", 2), ("Cheddar Cheese", 1), ("Red Onion", 1)],
        "Kids Cheeseburger": [("Sesame Bun", 1), ("Beef Patty", 1), ("American Cheese", 1), ("Ketchup", 1)],
        "Kids Chicken Tenders": [("Chicken Tenders Portion", 1), ("Fries Portion", 1), ("Ketchup", 1)],
        "Breakfast Burrito": [("Flour Tortilla", 1), ("Egg", 2), ("Breakfast Sausage", 1), ("Cheddar Cheese", 1), ("Black Beans", 1)],
    }

    for menu_name, ingredients in recipe_specs.items():
        menu_item_id = menu_by_name[menu_name].id
        for ingredient_name, qty_required in ingredients:
            ingredient_id = ingredients_by_name[ingredient_name].id
            _get_or_create_recipe(
                menu_item_id=menu_item_id,
                ingredient_id=ingredient_id,
                qty_required=qty_required,
            )


if __name__ == "__main__":
    seed()
