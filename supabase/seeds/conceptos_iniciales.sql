-- Conceptos iniciales tomados de los informes de servicios generales del cliente (pintura, SCI, control de acceso…).
-- Idempotente: no duplica textos ya guardados.
insert into public.concepts (kind, specialty, text) values
  ('detalle', '', 'Acondicionamiento del área a trabajar'),
  ('detalle', '', 'Correcto uso de EPPs'),
  ('detalle', '', 'Señalización y delimitación del área'),
  ('detalle', '', 'Permiso de trabajo del centro comercial'),

  ('trabajo', 'Control de acceso', 'Se realizó la inspección de la puerta y del punto de instalación, verificando las condiciones para la implementación del sistema de control de acceso y el brazo hidráulico.'),
  ('trabajo', 'Control de acceso', 'Se efectuó la instalación del equipo biométrico en la ubicación designada, asegurando su correcta fijación y alimentación eléctrica.'),
  ('trabajo', 'Control de acceso', 'Se realizó el tendido y conexión del cableado necesario para la integración del biométrico con el sistema de control de acceso.'),
  ('trabajo', 'Control de acceso', 'Se efectuó la configuración del equipo biométrico, registrando los parámetros de funcionamiento y verificando la correcta lectura de credenciales y/o huellas.'),
  ('trabajo', 'Control de acceso', 'Se realizó la instalación del brazo hidráulico en la puerta, efectuando los ajustes necesarios para garantizar un cierre controlado y uniforme.'),
  ('trabajo', 'Control de acceso', 'Se verificó la alineación de la puerta y se calibró la velocidad de cierre y el golpe final del brazo hidráulico.'),
  ('trabajo', 'Control de acceso', 'Se realizaron pruebas funcionales del sistema, verificando el correcto accionamiento del biométrico, la apertura de la puerta y el cierre automático mediante el brazo hidráulico.'),
  ('trabajo', 'Sistema contra incendios', 'Se realizó el cambio de detectores de humo dañados.'),
  ('trabajo', 'Sistema contra incendios', 'Se revisó el cableado de las luces estroboscópicas.'),
  ('trabajo', 'Sistema contra incendios', 'Se actualizó la hora y fecha del panel de alarma.'),

  ('foto', '', 'Estado inicial antes del servicio'),
  ('foto', '', 'Trabajos realizados durante el servicio'),
  ('foto', '', 'Estado final después del servicio'),
  ('foto', 'Sistema contra incendios', 'Detectores de humo dañados'),
  ('foto', 'Sistema contra incendios', 'Cambio de detectores de humo (revisión de cableado de luces estroboscópicas)'),
  ('foto', 'Servicios generales', 'Se realizó el cambio de luminarias deterioradas'),
  ('foto', 'Pintura', 'Limpieza de letrero (no incluye desmontaje)'),

  ('conclusion', 'Pintura', 'Se realizó satisfactoriamente el servicio de pintado de la tienda y la fachada, efectuando la aplicación de pintura en las áreas solicitadas y dejando las superficies con un acabado uniforme y en condiciones adecuadas.'),
  ('conclusion', 'Pintura', 'Se realizó de manera correcta el pintado integral en la tienda sin ningún inconveniente.'),
  ('conclusion', 'Pintura', 'Se realizó satisfactoriamente el servicio de resane y pintado del techo en la tienda, logrando mejorar el acabado, apariencia y condiciones generales del área intervenida.'),
  ('conclusion', 'Servicios generales', 'Se realizó satisfactoriamente la reparación del piso, corrigiendo las zonas deterioradas y dejando la superficie en condiciones adecuadas para su uso.'),
  ('conclusion', 'Servicios generales', 'Se realizó satisfactoriamente el mantenimiento de los letreros, mejorando su apariencia y manteniendo una adecuada presentación visual del establecimiento.'),
  ('conclusion', 'Servicios generales', 'Se realizó satisfactoriamente el servicio de instalación de luminarias y limpieza de bandejas y campanas, mejorando las condiciones de iluminación, limpieza y presentación de las áreas intervenidas.'),
  ('conclusion', 'Servicios generales', 'Se realizó satisfactoriamente el mantenimiento preventivo de la puerta enrollable y el cambio del gabinete de extintor, dejando ambos elementos en mejores condiciones de funcionamiento, seguridad y presentación.'),
  ('conclusion', 'Sistema contra incendios', 'Se realizó el mantenimiento de observaciones del sistema de detectores de alarma contra incendios, el cual incluyó el cambio de detectores de humo.'),
  ('conclusion', 'Control de acceso', 'Se verificó el estado inicial de las puertas, evidenciando condiciones generales adecuadas para la ejecución del servicio.'),

  ('observacion', 'Sistema contra incendios', 'Se evidenció una activación de la alarma contra incendios registrada en el panel en una zona que no corresponde a la ubicación real; se considera necesario revisar el circuito y cableado asociado al sistema.'),

  ('recomendacion', 'Pintura', 'Se recomienda realizar el mantenimiento preventivo de pintura según el nivel de exposición y estado de la fachada.'),
  ('recomendacion', 'Pintura', 'Seguir realizando el pintado de la tienda de acuerdo al cronograma establecido.'),
  ('recomendacion', 'Pintura', 'Se recomienda realizar inspecciones periódicas del techo para identificar posibles fisuras, humedad o desprendimientos y atenderlos oportunamente para conservar el acabado realizado.'),
  ('recomendacion', 'Servicios generales', 'Se recomienda realizar inspecciones periódicas del piso y atender oportunamente cualquier fisura, desprendimiento o deterioro que pueda comprometer su integridad y seguridad.'),
  ('recomendacion', 'Servicios generales', 'Se recomienda realizar limpiezas periódicas de los letreros para evitar la acumulación de polvo y suciedad, conservando su buena apariencia y visibilidad.'),
  ('recomendacion', 'Servicios generales', 'Se recomienda realizar mantenimientos y limpiezas periódicas de las luminarias, bandejas y campanas, verificando su estado para prevenir fallas y mantener las instalaciones en óptimas condiciones.'),
  ('recomendacion', 'Servicios generales', 'Se recomienda realizar inspecciones periódicas de la puerta enrollable y del gabinete de extintor, verificando su correcto funcionamiento y estado para prevenir deterioros y mantener las condiciones de seguridad.'),
  ('recomendacion', 'Sistema contra incendios', 'Realizar una revisión integral del cableado y conexiones del sistema de alarma contra incendios, verificando cada circuito y descartando posibles conexiones con instalaciones externas.'),
  ('recomendacion', 'Sistema contra incendios', 'Realizar el diagnóstico y/o reemplazo de los componentes que presenten fallas, tales como panel de alarma, detectores de humo, sirenas y estaciones manuales.'),
  ('recomendacion', 'Sistema contra incendios', 'Ejecutar pruebas funcionales del sistema una vez culminados los trabajos, verificando que las señales correspondan correctamente a la ubicación real de cada dispositivo.')
on conflict (kind, specialty, lower(text)) do nothing;
