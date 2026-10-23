CREATE DATABASE IF NOT EXISTS grandhorizon;
USE grandhorizon;

-- Core User Schema for Internal System Roles
CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_user_role CHECK (role IN ('admin', 'staff'))
);

-- Hotel Inventory Tables
CREATE TABLE IF NOT EXISTS room_categories (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    base_price_kes NUMERIC(12, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    room_number VARCHAR(10) UNIQUE NOT NULL,
    category_id BIGINT UNSIGNED,
    floor INT NOT NULL,
    status VARCHAR(20) DEFAULT 'Available',
    CONSTRAINT fk_room_category FOREIGN KEY (category_id) REFERENCES room_categories(id) ON DELETE RESTRICT,
    CONSTRAINT chk_room_status CHECK (status IN ('Available', 'Housekeeping', 'Maintenance'))
);

CREATE TABLE IF NOT EXISTS hotel_services (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL,
    description TEXT,
    price_kes NUMERIC(12, 2) NOT NULL
);

-- Reservation Tables
CREATE TABLE IF NOT EXISTS bookings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    confirmation_code VARCHAR(12) UNIQUE NOT NULL,
    guest_name VARCHAR(100) NOT NULL,
    guest_email VARCHAR(100) NOT NULL,
    guest_phone VARCHAR(20) NOT NULL,
    guest_id_passport VARCHAR(50) NOT NULL,
    room_id BIGINT UNSIGNED,
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    total_price_kes NUMERIC(12, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_booking_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE RESTRICT,
    CONSTRAINT chk_booking_status CHECK (status IN ('Pending', 'Confirmed', 'Checked-In', 'Checked-Out', 'Cancelled')),
    CONSTRAINT chk_dates CHECK (check_out_date > check_in_date)
);

-- Many-to-Many Bridge Table for Booking Services Add-ons
CREATE TABLE IF NOT EXISTS booking_services (
    booking_id BIGINT UNSIGNED,
    service_id BIGINT UNSIGNED,
    quantity INT DEFAULT 1,
    PRIMARY KEY (booking_id, service_id),
    CONSTRAINT fk_bs_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    CONSTRAINT fk_bs_service FOREIGN KEY (service_id) REFERENCES hotel_services(id) ON DELETE RESTRICT
);

-- Seed Room Categories
INSERT INTO room_categories (name, description, base_price_kes) VALUES
('High-Altitude Athlete Cabin', 'Custom-built cabin with high-altitude recovery environment, hypoxia simulation training options, and direct access to athletic running tracks in Eldoret.', 8000.00),
('Executive Business Suite', 'Premium corporate suite designed for business travelers visiting the Uasin Gishu County offices, featuring a dedicated high-speed workstation and board meeting options.', 15000.00),
('Deluxe Safari Room', 'Beautifully designed room featuring authentic Kenyan safari styling, natural earth tones, views of the sunset hills, and supreme premium relaxation.', 10000.00),
('Standard Horizon Twin', 'Comfortable and affordable stay with high-speed internet, premium twin bedding, and a complimentary local tea basket.', 6000.00);

-- Seed Rooms
INSERT INTO rooms (room_number, category_id, floor, status) VALUES
('101', (SELECT id FROM room_categories WHERE name = 'Standard Horizon Twin'), 1, 'Available'),
('102', (SELECT id FROM room_categories WHERE name = 'Standard Horizon Twin'), 1, 'Available'),
('103', (SELECT id FROM room_categories WHERE name = 'Standard Horizon Twin'), 1, 'Available'),
('201', (SELECT id FROM room_categories WHERE name = 'Deluxe Safari Room'), 2, 'Available'),
('202', (SELECT id FROM room_categories WHERE name = 'Deluxe Safari Room'), 2, 'Available'),
('301', (SELECT id FROM room_categories WHERE name = 'High-Altitude Athlete Cabin'), 3, 'Available'),
('302', (SELECT id FROM room_categories WHERE name = 'High-Altitude Athlete Cabin'), 3, 'Available'),
('401', (SELECT id FROM room_categories WHERE name = 'Executive Business Suite'), 4, 'Available')
ON DUPLICATE KEY UPDATE room_number=room_number;

-- Seed Hotel Add-on Services
INSERT INTO hotel_services (service_name, description, price_kes) VALUES
('Airport Shuttle (Eldoret International EDL)', 'Premium private shuttle service to and from Eldoret International Airport (EDL) in a clean executive transport.', 3500.00),
('High-Altitude Gym Access', 'Full access to our high-performance specialized gym equipped with athletic training tools, altitude chambers, and customized running assessments.', 1500.00),
('Traditional Kalenjin Dinner Package', 'An authentic Kenyan culinary experience featuring a selection of local proteins, maize-meal ugali, local greens, and traditional fresh Mursik (fermented milk).', 2500.00),
('Uasin Gishu County Office Shuttle & Business Kit', 'Private transport to/from County Assembly and Town Hall offices, plus a printed Uasin Gishu travel & business handbook and notebook kit.', 4000.00),
('Daily Horizon Buffet (Mursik & Continental)', 'Indulge in a premium daily breakfast and brunch buffet with standard continental treats and our signature Eldoret-style local teas and fresh Mursik.', 1200.00);

-- Seed Users (1 Admin + 6 Team Members with password "1177")
INSERT INTO users (name, email, password_hash, role) VALUES
('Allan', 'allan@gmail.com', '$2b$10$M7toEGlGSelXjyvnHq0QJ.4J2cdFY89.LLDiAqds7Ij4R6aJFhIXq', 'admin'),
('Frank Koech', 'frank@gmail.com', '$2b$10$M7toEGlGSelXjyvnHq0QJ.4J2cdFY89.LLDiAqds7Ij4R6aJFhIXq', 'staff'),
('Faith Kipyegon', 'faith@gmail.com', '$2b$10$M7toEGlGSelXjyvnHq0QJ.4J2cdFY89.LLDiAqds7Ij4R6aJFhIXq', 'staff'),
('Eliud Kipchoge', 'eliud@gmail.com', '$2b$10$M7toEGlGSelXjyvnHq0QJ.4J2cdFY89.LLDiAqds7Ij4R6aJFhIXq', 'staff'),
('Brenda Chebet', 'brenda@gmail.com', '$2b$10$M7toEGlGSelXjyvnHq0QJ.4J2cdFY89.LLDiAqds7Ij4R6aJFhIXq', 'staff'),
('David Rudisha', 'david@gmail.com', '$2b$10$M7toEGlGSelXjyvnHq0QJ.4J2cdFY89.LLDiAqds7Ij4R6aJFhIXq', 'staff'),
('Mercy Cherono', 'mercy@gmail.com', '$2b$10$M7toEGlGSelXjyvnHq0QJ.4J2cdFY89.LLDiAqds7Ij4R6aJFhIXq', 'staff')
ON DUPLICATE KEY UPDATE name=VALUES(name), password_hash=VALUES(password_hash), role=VALUES(role);