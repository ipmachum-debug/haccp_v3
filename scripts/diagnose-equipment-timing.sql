-- 설비 + 공정그룹 설정값 확인 (교반기 기준)

-- 1. 설비 기준값
SELECT e.id, e.name, e.type,
       e.default_temperature, e.default_pressure, e.default_time,
       e.batch_operation_time,
       e.edge_temperature, e.center_temperature
FROM equipments e
WHERE e.tenant_id = 2 AND e.status = 'active'
ORDER BY e.type, e.name;

-- 2. 공정그룹 설정값 (equip_interval_min, equip_batch_size)
SELECT pg.id, pg.name, pg.ccp_type,
       pg.equip_group_mode, pg.equip_interval_min, pg.equip_batch_size,
       pg.temperature_min, pg.temperature_max, pg.time_min, pg.time_max,
       pg.pressure_min
FROM ccp_process_groups pg
WHERE pg.tenant_id = 2 AND pg.status = 'active'
ORDER BY pg.ccp_type, pg.sort_order;

-- 3. h_ccp_rows의 실제 duration_min 값 확인 (최근 배치)
SELECT r.id, r.batch_no, r.equipment_name, r.sort_order,
       r.duration_min, r.heating_min, r.cycle_total_min,
       r.temp_c, r.pressure_bar
FROM h_ccp_rows r
JOIN h_ccp_instances i ON i.id = r.instance_id
WHERE i.tenant_id = 2 AND i.work_date >= '2026-04-07'
ORDER BY i.work_date DESC, r.instance_id, r.sort_order
LIMIT 30;

-- 4. 공정그룹-설비 매핑 (sort_order 확인)
SELECT pge.process_group_id, pg.name as pg_name,
       pge.equipment_id, e.name as eq_name, pge.sort_order
FROM ccp_process_group_equipments pge
JOIN ccp_process_groups pg ON pg.id = pge.process_group_id
JOIN equipments e ON e.id = pge.equipment_id
WHERE pge.tenant_id = 2
ORDER BY pg.ccp_type, pge.process_group_id, pge.sort_order;
