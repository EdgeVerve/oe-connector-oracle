-- Atul : This function checks if two given array has anything in common. if any values are common, it returns true. 
-- this uses json_table to conver CLOB into table and then uses regular SQL to compare
create or replace 
function oe_inq(ary1 CLOB, ary2 CLOB) RETURN VARCHAR2 AS
cnt numeric(10);
BEGIN
select count(*)
   into   cnt
   from (
select * from json_table(ary1,'$[*]' COLUMNS (n varchar2(200) PATH '$'))  q1
intersect
select * from json_table(ary2,'$[*]' COLUMNS (n varchar2(200) PATH '$'))  q2
);

if ( cnt = 0 ) then
return 'false';
else

return 'true';
end if;

END ;
