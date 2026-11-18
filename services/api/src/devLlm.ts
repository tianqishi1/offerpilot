import type { CompleteOptions } from '@offerpilot/llm';

function labelToPath(label: string): string | null {
  if (/姓名|名字/.test(label)) return 'basics.name';
  if (/学校|院校/.test(label)) return 'basics.school';
  if (/专业/.test(label)) return 'basics.major';
  if (/学历|学位/.test(label)) return 'basics.degree';
  if (/毕业年份|毕业时间/.test(label)) return 'basics.gradYear';
  if (/城市|地点/.test(label)) return 'basics.city';
  return null;
}

/**
 * 离线开发模式 LLM：从提示词中解析字段列表，按标签启发式映射。
 * 保证无 API Key 时全链路可跑通/可测试；生产用 DASHSCOPE_API_KEY 切换真实网关。
 */
export function heuristicMappingResponder(opts: CompleteOptions): unknown {
  const m = opts.prompt.match(/字段列表\(JSON\)：(\[[^\n]*\])/);
  const fields = m ? (JSON.parse(m[1]!) as { fieldId: string; label: string }[]) : [];
  const mappings = fields.map((f) => {
    const label = f.label ?? '';
    if (/为什么|规划|介绍|优势|动机|评价/.test(label)) {
      return { fieldId: f.fieldId, profilePath: null, generated: true, confidence: 0.7 };
    }
    if (/薪资|薪酬|签证|竞业|身份证|户口|政治面貌|服从调剂/.test(label)) {
      return { fieldId: f.fieldId, profilePath: null, generated: false, confidence: 1 };
    }
    const path = labelToPath(label);
    return { fieldId: f.fieldId, profilePath: path, generated: false, confidence: path ? 0.9 : 0.2 };
  });
  return { mappings };
}
