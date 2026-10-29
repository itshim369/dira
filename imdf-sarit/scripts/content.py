"""Card content for places (photo, description, product types, hours, website).

This is NOT written into the IMDF files: estimated hours and representative photos must not
reach a published venue map. build_imdf.py writes it to public/content/places.json, keyed by
IMDF feature id, and the viewer reads it next to the archive.

Hours use OpenStreetMap opening_hours syntax (the same syntax IMDF uses for HOURS) and are
estimates by type of business until each store confirms them.
"""

import json
from pathlib import Path

HOURS = {
    "mall": "Mo-Su 09:00-20:00",
    "supermarket": "Mo-Su 08:00-22:00",
    "bank": "Mo-Fr 08:30-16:00; Sa 09:00-12:00",
    "food": "Mo-Su 08:00-22:00",
    "office": "Mo-Fr 08:00-17:00",
    "health": "Mo-Sa 08:00-18:00",
    "entertainment": "Mo-Su 10:00-23:00",
    "fitness": "Mo-Su 06:00-21:00",
    "post": "Mo-Fr 08:00-17:00; Sa 09:00-12:00",
}

# category -> (hours rule, description, product types)
CATEGORY = {
    "supermarket": ("supermarket", "Supermarket with fresh food, groceries, household goods and everyday essentials.", ["Fresh food", "Groceries", "Household", "Bakery"]),
    "bank": ("bank", "Bank branch for accounts, cards, loans and help with mobile banking.", ["Accounts", "Cards", "Loans", "Mobile banking"]),
    "currencyexchange": ("mall", "Forex bureau for buying and selling foreign currency.", ["Foreign exchange", "Money transfer"]),
    "cafe": ("food", "Cafe serving coffee, breakfast and light meals.", ["Coffee", "Breakfast", "Light meals"]),
    "coffee": ("food", "Coffee shop with espresso drinks, tea and pastries.", ["Coffee", "Tea", "Pastries"]),
    "restaurant": ("food", "Restaurant serving sit-down meals and takeaway.", ["Meals", "Takeaway"]),
    "desserts": ("food", "Frozen yoghurt and desserts.", ["Frozen yoghurt", "Desserts"]),
    "icecream": ("food", "Ice cream and desserts.", ["Ice cream", "Desserts"]),
    "gelato": ("food", "Italian-style gelato and sorbet.", ["Gelato", "Sorbet"]),
    "indian": ("food", "Indian food, from curries to grills and snacks.", ["Indian", "Curries", "Takeaway"]),
    "chinese": ("food", "Chinese food to eat in or take away.", ["Chinese", "Takeaway"]),
    "mexican": ("food", "Mexican street food: tacos, burritos and more.", ["Tacos", "Mexican"]),
    "burgers": ("food", "Burgers, ribs and shakes.", ["Burgers", "Grills", "Shakes"]),
    "chickenshop": ("food", "Fried chicken meals and sides.", ["Fried chicken", "Takeaway"]),
    "tapas": ("food", "Wine bar serving tapas and small plates.", ["Wine", "Tapas"]),
    "specialtyfood": ("food", "Speciality food and snacks.", ["Snacks", "Speciality food"]),
    "bakedgoods": ("food", "Bakery with fresh bread, cakes and pastries.", ["Bread", "Cakes", "Pastries"]),
    "loungebar": ("food", "Lounge with drinks and food.", ["Drinks", "Food", "Lounge"]),
    "pharmacy": ("health", "Pharmacy for prescriptions, over-the-counter medicine and health products.", ["Prescriptions", "Medicine", "Health and beauty"]),
    "vitaminssupplements": ("mall", "Health store with vitamins, supplements and wellness products.", ["Vitamins", "Supplements", "Wellness"]),
    "eyewear.opticians": ("health", "Optician for eye tests, glasses and contact lenses.", ["Eye tests", "Glasses", "Contact lenses"]),
    "opticians": ("health", "Optician for eye tests, glasses and contact lenses.", ["Eye tests", "Glasses", "Contact lenses"]),
    "dentistry": ("health", "Dental clinic for check-ups and treatment.", ["Check-ups", "Treatment"]),
    "pediatrics": ("health", "Children's health clinic.", ["Children's health", "Consultations"]),
    "physician": ("health", "Doctor's clinic for consultations.", ["Consultations"]),
    "veterinarian": ("health", "Vet clinic and pet supplies.", ["Pet care", "Vet"]),
    "insurance.health": ("office", "Health insurance and medical cover.", ["Medical cover"]),
    "mobilephones": ("mall", "Phones, tablets and accessories.", ["Phones", "Accessories", "Repairs"]),
    "telecommunications": ("mall", "Mobile network shop for lines, phones, mobile money and home internet.", ["Lines", "Phones", "Mobile money", "Internet"]),
    "computersandaccessories": ("mall", "Computers, laptops and accessories.", ["Laptops", "Accessories", "Printers"]),
    "electronicappliances": ("mall", "Electronics and smart home devices.", ["Electronics", "Smart home"]),
    "appliances": ("mall", "Home appliances: TVs, fridges, cookers and small appliances.", ["TVs", "Fridges", "Cookers", "Small appliances"]),
    "televisionserviceproviders": ("mall", "Pay TV subscriptions and support.", ["Subscriptions", "Decoders", "Support"]),
    "clothing": ("mall", "Fashion and accessories.", ["Clothing", "Accessories"]),
    "clothing.womens": ("mall", "Women's fashion and accessories.", ["Women's clothing", "Accessories"]),
    "clothing.mens": ("mall", "Men's fashion.", ["Men's clothing", "Accessories"]),
    "departmentstore": ("mall", "Department store with clothing, home and beauty.", ["Clothing", "Home", "Beauty"]),
    "uniforms": ("mall", "School and work uniforms.", ["School uniforms", "Work wear"]),
    "sportswear": ("mall", "Sportswear, trainers and sports gear.", ["Trainers", "Sportswear", "Accessories"]),
    "sportinggoods": ("mall", "Sports equipment and sportswear.", ["Equipment", "Sportswear"]),
    "shoes": ("mall", "Shoes for the family.", ["Shoes", "Bags"]),
    "jewelry": ("mall", "Jewellery and watches.", ["Jewellery", "Watches"]),
    "leathergoods": ("mall", "Leather bags and accessories.", ["Bags", "Leather goods"]),
    "luggage": ("mall", "Suitcases, travel bags and accessories.", ["Suitcases", "Travel bags"]),
    "perfume": ("mall", "Perfumes and fragrances.", ["Perfume", "Oud", "Gift sets"]),
    "cosmetics": ("mall", "Make-up, skincare and beauty products.", ["Make-up", "Skincare", "Fragrance"]),
    "beautysalon": ("mall", "Beauty salon for hair, nails and treatments.", ["Hair", "Nails", "Treatments"]),
    "hairstylist": ("mall", "Hair salon.", ["Hair", "Styling"]),
    "homedecor": ("mall", "Homeware, decor and kitchen goods.", ["Homeware", "Decor", "Kitchen"]),
    "homeandgarden": ("mall", "Home and kitchen goods.", ["Kitchen", "Home"]),
    "kitchenandbath": ("mall", "Baking and kitchen supplies.", ["Baking", "Kitchen"]),
    "furniture": ("mall", "Furniture for the home and office.", ["Furniture", "Home office"]),
    "mattresses": ("mall", "Mattresses, beds and bedding.", ["Mattresses", "Beds", "Bedding"]),
    "carpet": ("mall", "Carpets and rugs.", ["Carpets", "Rugs"]),
    "lighting": ("mall", "Lampshades and lighting.", ["Lampshades", "Lighting"]),
    "hardware": ("mall", "Hardware and home improvement.", ["Tools", "Hardware"]),
    "artsandcrafts": ("mall", "Handicrafts, art and souvenirs.", ["Crafts", "Art", "Gifts"]),
    "pictureframing": ("mall", "Picture framing and glass.", ["Framing", "Glass"]),
    "giftshops": ("mall", "Gifts and novelties.", ["Gifts", "Homeware"]),
    "books": ("mall", "Books, stationery and school supplies.", ["Books", "Stationery"]),
    "toystore": ("mall", "Toys and games for children.", ["Toys", "Games"]),
    "babyclothesandsupplies": ("mall", "Baby clothes, gear and essentials.", ["Baby clothes", "Baby gear"]),
    "partysupplies": ("mall", "Party supplies, balloons and decorations.", ["Party supplies", "Decorations"]),
    "photography": ("mall", "Photo printing and photography services.", ["Photo printing", "Passport photos"]),
    "copyshop": ("mall", "Printing, copying and binding.", ["Printing", "Copying"]),
    "bicycleshop": ("mall", "Bicycles, parts and accessories.", ["Bicycles", "Parts"]),
    "courier": ("office", "Courier and parcel services.", ["Parcels", "Courier"]),
    "postoffice": ("post", "Post office for letters, parcels and post boxes.", ["Post", "Parcels"]),
    "airline": ("office", "Airline office for bookings and ticket changes.", ["Bookings", "Tickets"]),
    "advertising": ("office", "Advertising and branding services.", ["Advertising", "Branding"]),
    "realestate.agents": ("office", "Real estate agency.", ["Property sales", "Lettings"]),
    "propertymanagement": ("office", "Property management office.", ["Management office"]),
    "businessconsulting": ("office", "Business consultancy office.", ["Consulting"]),
    "lawyer": ("office", "Law firm.", ["Legal services"]),
    "accounting": ("office", "Accountants and auditors.", ["Accounting", "Audit"]),
    "insurance": ("office", "Insurance agency.", ["Insurance"]),
    "corporateoffices": ("office", "Office.", ["Office"]),
    "architecture": ("office", "Architecture and design office.", ["Architecture"]),
    "interiordesign": ("mall", "Interior design and furnishing.", ["Interior design"]),
    "passportvisaservices": ("office", "Immigration and visa consultancy.", ["Visas", "Immigration"]),
    "automotive": ("office", "Motoring services.", ["Motoring", "Driving"]),
    "eventspace": ("entertainment", "Exhibition and events hall.", ["Exhibitions", "Events"]),
    "theater.movie": ("entertainment", "Cinema showing the latest films.", ["Films", "Snacks"]),
    "familyfuncenter": ("entertainment", "Family entertainment: bowling, games and food.", ["Bowling", "Games", "Food"]),
    "trampolining": ("entertainment", "Trampoline park for kids and adults.", ["Trampolines", "Parties"]),
    "gym": ("fitness", "Gym and fitness classes.", ["Gym", "Classes"]),
    "sportsclub": ("fitness", "Padel courts and coaching.", ["Padel", "Coaching"]),
    "floatspa": ("fitness", "Float therapy and relaxation.", ["Float therapy", "Wellness"]),
    "shopping": ("mall", "Shop.", []),
}

# Specific facts for well-known businesses (kept to what is publicly well established).
BRANDS = {
    "Carrefour": {"description": "Hypermarket with fresh food, groceries, household goods and electronics.", "photo": "carrefour"},
    "Java": {"description": "Kenyan coffee house chain serving coffee, breakfast and meals all day.", "website": "https://www.javahouseafrica.com"},
    "Safaricom": {"description": "Safaricom shop for lines, phones, M-Pesa and home internet.", "website": "https://www.safaricom.co.ke"},
    "KCB Bank": {"description": "KCB Bank branch for accounts, cards, loans and mobile banking.", "photo": "kcb", "website": "https://ke.kcbgroup.com"},
    "KCB Advantage": {"description": "KCB premium banking centre.", "photo": "kcb", "website": "https://ke.kcbgroup.com"},
    "Absa Bank": {"website": "https://www.absabank.co.ke"},
    "NCBA Bank": {"website": "https://ke.ncbagroup.com"},
    "NCBA Loop": {"description": "NCBA's digital banking brand: help with the Loop app and cards.", "website": "https://ke.ncbagroup.com"},
    "Standard Chartered Bank": {"website": "https://www.sc.com/ke"},
    "Hotpoint": {"description": "Hotpoint Appliances showroom: TVs, fridges, cookers and small appliances."},
    "Goodlife Pharmacy": {"description": "Pharmacy chain for prescriptions, over-the-counter medicine and health products."},
    "Text Book Centre": {"description": "Kenyan bookshop and stationery chain: books, school supplies and office stationery."},
    "Kenya Airways": {"website": "https://www.kenya-airways.com"},
    "DHL": {"website": "https://www.dhl.com/ke-en"},
    "FedEx": {"website": "https://www.fedex.com"},
    "Airtel Kenya": {"description": "Airtel shop for lines, phones, Airtel Money and internet.", "website": "https://www.airtelkenya.com"},
    "Posta": {"description": "Posta Kenya post office for letters, parcels and post boxes."},
    "LC Waikiki": {"description": "Fashion for women, men and children."},
    "Century Cinemax": {"description": "Cinema showing the latest local and international films."},
    "Sarit Expo Centre": {"description": "Sarit Centre's exhibition hall, used for trade fairs, expos and events."},
}

PHOTOS = {
    "carrefour": {
        "src": "photos/carrefour.jpg",
        "caption": "Representative photo: Carrefour at Village Market, Nairobi",
        "credit": "Wadakuramon, CC BY-SA 4.0",
        "source": "https://commons.wikimedia.org/wiki/File:Village_Market_-_Carrefour_6.jpg",
    },
    "kcb": {
        "src": "photos/kcb.jpg",
        "caption": "Representative photo: KCB Kipande branch, Kenyatta Avenue",
        "credit": "DEMOSH, CC BY 2.0",
        "source": "https://commons.wikimedia.org/wiki/File:KCB_bank_(2108245215).jpg",
    },
    "sarit": {
        "src": "photos/sarit-centre.jpg",
        "caption": "Sarit Centre, Westlands",
        "credit": "OhanaUnited, CC BY-SA 3.0",
        "source": "https://commons.wikimedia.org/wiki/File:Sarit_Centre.jpg",
    },
}

# Sample photos for demos (scripts/fetch_mock_photos.py): generic, openly licensed photos of
# the same kind of business. Shown with a "Sample photo" badge until the tenant sends a real one.
MOCK_BY_CATEGORY = {
    "supermarket": "grocery",
    "cafe": "cafe", "coffee": "cafe",
    "restaurant": "restaurant", "indian": "restaurant", "chinese": "restaurant", "mexican": "restaurant", "specialtyfood": "restaurant",
    "burgers": "fastfood", "chickenshop": "fastfood",
    "desserts": "dessert", "icecream": "dessert", "gelato": "dessert",
    "bakedgoods": "bakery",
    "bank": "bank", "currencyexchange": "bank", "insurance": "bank", "insurance.health": "bank",
    "mobilephones": "phones", "telecommunications": "phones",
    "computersandaccessories": "electronics", "electronicappliances": "electronics", "appliances": "electronics",
    "televisionserviceproviders": "electronics", "photography": "electronics",
    "clothing": "fashion", "clothing.womens": "fashion", "clothing.mens": "fashion", "departmentstore": "fashion",
    "uniforms": "fashion", "leathergoods": "fashion", "luggage": "fashion",
    "shoes": "shoes",
    "jewelry": "jewellery",
    "cosmetics": "beauty", "perfume": "beauty",
    "beautysalon": "salon", "hairstylist": "salon",
    "pharmacy": "pharmacy", "vitaminssupplements": "pharmacy",
    "eyewear.opticians": "optician", "opticians": "optician",
    "homedecor": "home", "homeandgarden": "home", "kitchenandbath": "home", "furniture": "home", "mattresses": "home",
    "carpet": "home", "lighting": "home", "hardware": "home", "interiordesign": "home", "pictureframing": "home",
    "artsandcrafts": "home", "giftshops": "home",
    "books": "books",
    "toystore": "toys", "babyclothesandsupplies": "toys", "partysupplies": "toys",
    "sportswear": "sports", "sportinggoods": "sports", "bicycleshop": "sports",
    "theater.movie": "cinema",
    "familyfuncenter": "fun", "trampolining": "fun",
    "gym": "gym", "sportsclub": "gym", "floatspa": "gym",
    "corporateoffices": "office", "propertymanagement": "office", "businessconsulting": "office", "lawyer": "office",
    "accounting": "office", "architecture": "office", "realestate.agents": "office", "advertising": "office",
    "passportvisaservices": "office", "automotive": "office", "airline": "office",
    "dentistry": "clinic", "pediatrics": "clinic", "physician": "clinic", "veterinarian": "clinic",
    "loungebar": "lounge", "tapas": "lounge",
    "postoffice": "services", "courier": "services", "copyshop": "services", "shopping": "services",
    "eventspace": "expo",
}
_MOCK_CREDITS = Path(__file__).resolve().parent.parent / "public" / "photos" / "mock" / "credits.json"
MOCK = json.loads(_MOCK_CREDITS.read_text(encoding="utf-8")) if _MOCK_CREDITS.exists() else {}


def mock_photo(category):
    m = MOCK.get(MOCK_BY_CATEGORY.get(category, "services"))
    if not m:
        return None
    return {
        "src": m["src"],
        "caption": "Sample photo for the demo, not this store",
        "credit": f"{m['author']}, {m['licence']}",
        "source": m["page"],
        "sample": True,
    }


AMENITY_TEXT = {
    "restroom": ("Washrooms.", ["Washrooms"]),
    "escalator": ("Escalator between floors.", []),
    "elevator": ("Lift between floors, step free.", ["Step free"]),
    "stairs": ("Stairs between floors.", []),
    "atm": ("Cash machine.", ["Cash"]),
    "entry": ("Pedestrian entrance.", []),
    "parking": ("Car park.", ["Parking"]),
    "prayerroom": ("Prayer and quiet room.", ["Quiet room"]),
}


def place_content(name, category, verify=False):
    rule, desc, tags = CATEGORY.get(category, CATEGORY["shopping"])
    brand = BRANDS.get(name, {})
    entry = {
        "description": brand.get("description", desc),
        "tags": tags,
        "hours": HOURS[rule],
        "hours_status": "estimate",
        "website": brand.get("website"),
        "photo": PHOTOS.get(brand.get("photo")) if brand.get("photo") else None,
        "flags": [],
    }
    if not entry["photo"]:
        entry["flags"].append("photo-needed")
        entry["photo"] = mock_photo(category)
    if verify:
        entry["flags"].append("name-to-verify")
    return entry


def amenity_content(category):
    desc, tags = AMENITY_TEXT.get(category, ("", []))
    return {"description": desc, "tags": tags, "hours": None, "hours_status": None, "website": None, "photo": None, "flags": []}


def venue_content():
    return {
        "description": "Shopping centre in Westlands, Nairobi, with shops, banks, restaurants, a cinema, an expo hall and offices across eight levels.",
        "photo": PHOTOS["sarit"],
        "hours": HOURS["mall"],
        "hours_status": "estimate",
    }
