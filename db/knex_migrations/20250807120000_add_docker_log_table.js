exports.up = function (knex) {
    return knex.schema
        .createTable("docker_log", function (table) {
            table.increments("id").primary();
            table.integer("monitor_id").notNullable().references("id").inTable("monitor").onDelete("CASCADE");
            table.dateTime("ts").notNullable().defaultTo(knex.fn.now());
            table.text("log").notNullable();
        });
};

exports.down = function (knex) {
    return knex.schema
        .dropTable("docker_log");
};
