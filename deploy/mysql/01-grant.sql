-- The MySQL entrypoint creates MYSQL_USER before processing init files, but the
-- bootstrap script drops and recreates the database. Re-apply the grant after
-- that so the application never connects as root.
GRANT ALL PRIVILEGES ON campushub_standalone.* TO 'campushub'@'%';
FLUSH PRIVILEGES;
