-- E3-H5: quién anuló la solicitud y con qué comentario. La 0011 dejó UPDATE por columnas en
-- requests; aquí se suman las dos columnas nuevas.
grant update (closed_by, close_comment) on requests to app_user;
