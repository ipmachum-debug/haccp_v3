CREATE TABLE IF NOT EXISTS h_ccp_monitoring (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ccp_point VARCHAR(255) NOT NULL,
  monitoring_date DATE NOT NULL,
  monitoring_time VARCHAR(10) NOT NULL,
  measured_value VARCHAR(100) NOT NULL,
  critical_limit VARCHAR(100) NOT NULL,
  status ENUM('normal', 'warning', 'critical') NOT NULL DEFAULT 'normal',
  monitored_by BIGINT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS h_production_batches (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  batch_number VARCHAR(50) NOT NULL UNIQUE,
  product_id BIGINT NOT NULL,
  planned_quantity VARCHAR(50) NOT NULL,
  actual_quantity VARCHAR(50),
  production_date DATE NOT NULL,
  expiry_date DATE,
  status ENUM('planned', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'planned',
  created_by BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS h_production_material_usage (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  batch_id BIGINT NOT NULL,
  material_id BIGINT NOT NULL,
  lot_number VARCHAR(50) NOT NULL,
  planned_quantity VARCHAR(50) NOT NULL,
  actual_quantity VARCHAR(50),
  unit VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS h_product_inventory (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT NOT NULL,
  quantity VARCHAR(50) NOT NULL,
  available_quantity VARCHAR(50) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  location VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
