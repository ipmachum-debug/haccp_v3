  // =========================================================================
  // CCP 모니터링 기록지 (ccpForm)
  // CCP-2B: 가열(굽기), CCP-1B: 가열(증숙), CCP-4P: 금속검출
  // =========================================================================
  ccpForm: router({

    /** 배치에 연결된 CCP 기록지 목록 조회 */
    getByBatch: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input }) => {
        const { getCcpFormRecordsByBatch } = await import("./db/ccpFormRecords");
        return getCcpFormRecordsByBatch(input.batchId);
      }),

    /** CCP 기록지 단건 (행 포함) 조회 */
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const { getCcpFormRecordById } = await import("./db/ccpFormRecords");
        return getCcpFormRecordById(input.id);
      }),

    /** CCP 기록지 생성 또는 기존 조회 */
    getOrCreate: workerProcedure
      .input(z.object({
        batchId: z.number(),
        ccpType: z.string(),
        workDate: z.string(),
        productId: z.number().optional(),
        productName: z.string().optional(),
        processGroupId: z.number().optional(),
        processGroupName: z.string().optional(),
        bomBatchKg: z.number().optional(),
        plannedQtyKg: z.number().optional(),
        clHeatTimeMinLo: z.number().optional(),
        clHeatTimeMinHi: z.number().optional(),
        clHeatTempLo: z.number().optional(),
        clPressureMpaLo: z.number().optional(),
        clProductTempLo: z.number().optional(),
        clMetalSensitivity: z.number().optional(),
        clFeMm: z.number().optional(),
        clSusMm: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getOrCreateCcpFormRecord } = await import("./db/ccpFormRecords");
        return getOrCreateCcpFormRecord({
          tenantId: ctx.user.tenantId,
          siteId: ctx.user.siteId ?? 1,
          batchId: input.batchId,
          ccpType: input.ccpType,
          workDate: input.workDate,
          productId: input.productId,
          productName: input.productName,
          processGroupId: input.processGroupId,
          processGroupName: input.processGroupName,
          bomBatchKg: input.bomBatchKg,
          plannedQtyKg: input.plannedQtyKg,
          writerId: ctx.user.id,
          clHeatTimeMinLo: input.clHeatTimeMinLo,
          clHeatTimeMinHi: input.clHeatTimeMinHi,
          clHeatTempLo: input.clHeatTempLo,
          clPressureMpaLo: input.clPressureMpaLo,
          clProductTempLo: input.clProductTempLo,
          clMetalSensitivity: input.clMetalSensitivity,
          clFeMm: input.clFeMm,
          clSusMm: input.clSusMm,
        });
      }),

    /** CCP 기록지 헤더 업데이트 */
    updateRecord: workerProcedure
      .input(z.object({
        id: z.number(),
        equipGroupMode: z.enum(["concurrent", "sequential"]).optional(),
        equipIntervalMin: z.number().optional(),
        clHeatTimeMinLo: z.number().optional(),
        clHeatTimeMinHi: z.number().optional(),
        clHeatTempLo: z.number().optional(),
        clPressureMpaLo: z.number().optional(),
        clProductTempLo: z.number().optional(),
        clMetalSensitivity: z.number().optional(),
        clFeMm: z.number().optional(),
        clSusMm: z.number().optional(),
        batchCount: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { updateCcpFormRecord } = await import("./db/ccpFormRecords");
        const { id, ...rest } = input;
        const updateData: Record<string, unknown> = {};
        if (rest.equipGroupMode !== undefined) updateData.equipGroupMode = rest.equipGroupMode;
        if (rest.equipIntervalMin !== undefined) updateData.equipIntervalMin = rest.equipIntervalMin;
        if (rest.batchCount !== undefined) updateData.batchCount = rest.batchCount;
        if (rest.clHeatTimeMinLo !== undefined) updateData.clHeatTimeMinLo = rest.clHeatTimeMinLo;
        if (rest.clHeatTimeMinHi !== undefined) updateData.clHeatTimeMinHi = rest.clHeatTimeMinHi;
        if (rest.clHeatTempLo !== undefined) updateData.clHeatTempLo = rest.clHeatTempLo.toString();
        if (rest.clPressureMpaLo !== undefined) updateData.clPressureMpaLo = rest.clPressureMpaLo.toString();
        if (rest.clProductTempLo !== undefined) updateData.clProductTempLo = rest.clProductTempLo.toString();
        if (rest.clMetalSensitivity !== undefined) updateData.clMetalSensitivity = rest.clMetalSensitivity;
        if (rest.clFeMm !== undefined) updateData.clFeMm = rest.clFeMm.toString();
        if (rest.clSusMm !== undefined) updateData.clSusMm = rest.clSusMm.toString();
        await updateCcpFormRecord(id, updateData);
        return { success: true };
      }),

    /** CCP 기록 행 저장 */
    saveRow: workerProcedure
      .input(z.object({
        formRecordId: z.number(),
        batchSeq: z.number().default(1),
        equipmentId: z.number().optional(),
        equipmentName: z.string().optional(),
        equipmentType: z.string().optional(),
        productName: z.string().optional(),
        measurementTime: z.string().optional(),
        inputQtyKg: z.number().optional(),
        result: z.enum(["적합", "부적합"]).optional(),
        heatTimeMin: z.number().optional(),
        heatTempC: z.number().optional(),
        siruName: z.string().optional(),
        pressureMpa: z.number().optional(),
        tempEdgeC: z.number().optional(),
        tempCenterC: z.number().optional(),
        metalPassTime: z.string().optional(),
        metalFeMid: z.string().optional(),
        metalSusMid: z.string().optional(),
        metalProductOnly: z.string().optional(),
        metalFeProduct: z.string().optional(),
        metalSusProduct: z.string().optional(),
        passTimeStart: z.string().optional(),
        passTimeEnd: z.string().optional(),
        passQty: z.number().optional(),
        detectedQty: z.number().optional(),
        specialNote: z.string().optional(),
        isDeviation: z.boolean().optional(),
        deviationNote: z.string().optional(),
        correctiveAction: z.string().optional(),
        actionBy: z.string().optional(),
        confirmedBy: z.string().optional(),
        note: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { upsertCcpFormRow } = await import("./db/ccpFormRecords");
        const rowId = await upsertCcpFormRow({
          tenantId: ctx.user.tenantId,
          formRecordId: input.formRecordId,
          batchSeq: input.batchSeq,
          equipmentId: input.equipmentId,
          equipmentName: input.equipmentName,
          equipmentType: input.equipmentType,
          productName: input.productName,
          measurementTime: input.measurementTime,
          inputQtyKg: input.inputQtyKg?.toString(),
          result: input.result,
          heatTimeMin: input.heatTimeMin,
          heatTempC: input.heatTempC?.toString(),
          siruName: input.siruName,
          pressureMpa: input.pressureMpa?.toString(),
          tempEdgeC: input.tempEdgeC?.toString(),
          tempCenterC: input.tempCenterC?.toString(),
          metalPassTime: input.metalPassTime,
          metalFeMid: input.metalFeMid,
          metalSusMid: input.metalSusMid,
          metalProductOnly: input.metalProductOnly,
          metalFeProduct: input.metalFeProduct,
          metalSusProduct: input.metalSusProduct,
          passTimeStart: input.passTimeStart,
          passTimeEnd: input.passTimeEnd,
          passQty: input.passQty,
          detectedQty: input.detectedQty,
          specialNote: input.specialNote,
          isDeviation: input.isDeviation ? 1 : 0,
          deviationNote: input.deviationNote,
          correctiveAction: input.correctiveAction,
          actionBy: input.actionBy,
          confirmedBy: input.confirmedBy,
          note: input.note,
        });
        return { success: true, rowId };
      }),

    /** 기록 행 삭제 */
    deleteRow: workerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { deleteCcpFormRow } = await import("./db/ccpFormRecords");
        await deleteCcpFormRow(input.id);
        return { success: true };
      }),

    /** 기록지 제출 (승인 요청) */
    submit: workerProcedure
      .input(z.object({
        formRecordId: z.number(),
        batchNumber: z.string(),
        productName: z.string().optional(),
        ccpType: z.string(),
        workDate: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { submitCcpFormRecord } = await import("./db/ccpFormRecords");
        const approvalId = await submitCcpFormRecord({
          formRecordId: input.formRecordId,
          tenantId: ctx.user.tenantId,
          siteId: ctx.user.siteId ?? 1,
          writerId: ctx.user.id,
          batchNumber: input.batchNumber,
          productName: input.productName ?? "",
          ccpType: input.ccpType,
          workDate: input.workDate,
        });
        return { success: true, approvalRequestId: approvalId };
      }),

    /** 설비 배치 간격 설정 저장 */
    saveEquipSettings: workerProcedure
      .input(z.object({
        processGroupId: z.number(),
        groupMode: z.enum(["concurrent", "sequential"]),
        intervalBetweenMin: z.number().optional(),
        maxConcurrent: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { upsertCcpEquipBatchSettings } = await import("./db/ccpFormRecords");
        const id = await upsertCcpEquipBatchSettings({
          tenantId: ctx.user.tenantId,
          processGroupId: input.processGroupId,
          groupMode: input.groupMode,
          intervalBetweenMin: input.intervalBetweenMin,
          maxConcurrent: input.maxConcurrent,
          notes: input.notes,
        });
        return { success: true, id };
      }),

    /** 설비 배치 간격 설정 조회 */
    getEquipSettings: protectedProcedure
      .input(z.object({ processGroupId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getCcpEquipBatchSettings } = await import("./db/ccpFormRecords");
        return getCcpEquipBatchSettings(ctx.user.tenantId, input.processGroupId);
      }),
  }),
});
