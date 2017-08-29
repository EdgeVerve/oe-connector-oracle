-- Atul : This function checks if two given array has anything in common. if any values are common, it returns false. 
create or replace 
function oe_nin(ary1 CLOB, ary2 CLOB) RETURN VARCHAR2 AS
cnt numeric(10);
rValue varchar2(100);
l_line VARCHAR2(255);
l_file utl_file.file_type;
BEGIN

--l_file := utl_file.fopen('TMP', 'foo.log', 'a');
--utl_file.put_line(l_file, 'second simple comment ' || TO_CHAR(SYSDATE, 'HH24:MI:SS' || ' ' || utl_raw.cast_to_varchar2(ary1) || ' ' || utl_raw.cast_to_varchar2(ary2)));

--utl_file.fflush(l_file);
--utl_file.fclose(l_file);
--DBMS_OUTPUT.put_line('second simple comment ' || TO_CHAR(SYSDATE, 'HH24:MI:SS'));


select count(*)
   into   cnt
   from (
select * from json_table(ary1,'$[*]' COLUMNS (n varchar2(200) PATH '$'))  q1
intersect
select * from json_table(ary2,'$[*]' COLUMNS (n varchar2(200) PATH '$'))  q2
);

if ( cnt = 0 ) then
return 'true';
else

return 'false';
end if;


EXCEPTION  -- exception handlers begin
   WHEN OTHERS THEN  -- handles all other errors
      --return 'XXXXX';
            raise_application_error(-20001,'An error was encountered - '||SQLCODE||' -ERROR- '||SQLERRM);

END ;
