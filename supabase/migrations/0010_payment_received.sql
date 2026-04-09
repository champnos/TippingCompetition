INSERT INTO transaction_types (name) VALUES ('Payment Received')
ON CONFLICT (name) DO NOTHING;
