create or replace 
FUNCTION OE_CONTAINS(outer_array CLOB, inner_array  CLOB) RETURN VARCHAR2 AS
cnt numeric(10);
inner_cnt numeric(10);
  i   NUMBER := 0;
BEGIN



select count(1)
   into   cnt
   from (
select * from json_table(inner_array,'$[*]' COLUMNS (n varchar2(100) PATH '$'))  q1
intersect
select * from json_table(outer_array,'$[*]' COLUMNS (n varchar2(100) PATH '$'))  q2
);

select count(1) into inner_cnt from json_table(inner_array,'$[*]' COLUMNS (n varchar2(100) PATH '$')) ;

if ( inner_cnt = cnt ) then
return 'true';
else
return 'false';
end if;




--FOR rec IN (select n from json_table(inner_array,'$[*]' COLUMNS (n varchar2(100) PATH '$')) )
--  LOOP
--    SELECT count(1) into i from json_table(outer_array,'$[*]' COLUMNS (n varchar2(100) PATH '$'))  q2 WHERE q2.n = rec.n;
--      if ( i = 0 ) then
--        return 'false';
--      end if;
--  END LOOP;

--return 'true';

EXCEPTION  -- exception handlers begin
   WHEN OTHERS THEN  -- handles all other errors
      --return 'XXXXX';
            raise_application_error(-20001,'An error was encountered - '||SQLCODE||' -ERROR- '||SQLERRM);


END OE_CONTAINS;
