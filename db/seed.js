'use strict';

const bcrypt = require('bcryptjs');

/**
 * サンプルデータ投入
 * - SEED_SAMPLE_DATA=true のときのみ server.js から呼び出す
 * - データが既に存在する場合は何もしない（冪等性を保つ）
 *
 * @param {import('better-sqlite3').Database} db
 */
function seedDatabase(db) {
  // field_masters が既に存在する場合はスキップ
  const mastersCount = db.prepare('SELECT COUNT(*) as cnt FROM field_masters').get();
  if (mastersCount.cnt > 0) {
    console.log('サンプルデータは既に存在します。スキップします。');
    return;
  }

  // ===========================
  // ユーザー投入
  // ===========================
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (username, password_hash, role, display_name)
    VALUES (?, ?, ?, ?)
  `);

  const teacherHash = bcrypt.hashSync('teacher123', 10);
  insertUser.run('yamada', teacherHash, 'teacher', '山田 太郎');
  insertUser.run('suzuki', teacherHash, 'teacher', '鈴木 花子');

  // ===========================
  // マスターデータ投入
  // ===========================
  const insertMaster = db.prepare(`
    INSERT INTO field_masters (field_type, label, sort_order)
    VALUES (?, ?, ?)
  `);

  const masterData = {
    department: [
      '事業創造学部',
      '情報学部',
    ],
    game_element: [
      'ポイント制',
      'バッジ・称号',
      'レベルアップ',
      'チーム対戦',
      'なし',
    ],
    consultation_method: [
      'オフィスアワー',
      'メール',
      'LMS',
      '授業内のみ',
      'チャットツール',
    ],
    ai_usage_scope: [
      '使用不可',
      '一部許可',
      '全面許可',
      '推奨',
      '必須',
    ],
    industry: [
      '情報通信業',
      '金融・保険業',
      '製造業',
      '医療・福祉',
      '小売業',
      '公務',
      '教育',
      '全業種',
    ],
    occupation: [
      'クラウドエンジニア',
      'インフラエンジニア',
      'データサイエンティスト',
      'ITコンサルタント',
      '経営企画',
      '営業',
      '研究者',
    ],
    evaluation: [
      '秀',
      '優',
      '良',
      '可',
      '不可',
    ],
  };

  for (const [fieldType, labels] of Object.entries(masterData)) {
    labels.forEach((label, idx) => {
      insertMaster.run(fieldType, label, idx + 1);
    });
  }

  // ===========================
  // マスターIDの取得ヘルパー
  // ===========================
  const getMasterId = (fieldType, label) => {
    const row = db.prepare(
      'SELECT id FROM field_masters WHERE field_type = ? AND label = ?'
    ).get(fieldType, label);
    return row ? row.id : null;
  };

  const yamadaId = db.prepare("SELECT id FROM users WHERE username = 'yamada'").get().id;

  // ===========================
  // シラバスレビューサンプル
  // ===========================
  const departmentId  = getMasterId('department',  '情報学部');
  const evaluationSec = getMasterId('evaluation',  '秀');

  const syllabusResult = db.prepare(`
    INSERT INTO syllabus_reviews (
      subject_name, academic_year, department_id,
      knowledge_skills, ai_skills, non_ict_value,
      evaluation_id, evaluation_comment, university_learning,
      is_published, created_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
  `).run(
    'クラウドコンピューティング',
    2025,
    departmentId,
    // knowledge_skills
    `## 習得できる知識・技能

- **クラウドサービスの基礎**: AWS・Azure・GCP の主要サービスを理解し、用途に応じて選択できる
- **IaaS / PaaS / SaaS の概念**: 各サービスモデルの違いと適切な使い分けを説明できる
- **ネットワーク設計**: VPC・サブネット・セキュリティグループを用いた安全なネットワーク構成を設計できる
- **コスト最適化**: クラウドのコスト構造を理解し、リソースの適切なサイジングができる
- **インフラのコード化（IaC）**: Terraform を用いてインフラをコードで管理できる`,
    // ai_skills
    `## 磨けるAI活用能力

- **クラウドAIサービスの活用**: Amazon Bedrock・Azure OpenAI 等のマネージドAIサービスを業務に組み込める
- **プロンプトエンジニアリング**: 効果的なプロンプト設計によりAIの出力品質を向上させられる
- **AIを用いたインフラ管理**: インフラ構成の自動生成・レビューにAIを活用できる
- **コスト・パフォーマンス分析**: AIを使ったリソース使用状況の分析と最適化提案ができる`,
    // non_ict_value
    `## 情報通信業以外で役立つこと

クラウドコンピューティングの知識は、あらゆる業種のDX推進において不可欠です。

- **製造業**: スマートファクトリーのデータ基盤構築、IoTセンサーデータの収集・分析
- **医療・福祉**: 電子カルテのクラウド移行、遠隔医療システムの構築
- **金融・保険**: 勘定系システムのクラウド移行、リアルタイムリスク分析基盤
- **小売業**: EC プラットフォームのスケーラブルな運用、購買データ分析`,
    evaluationSec,
    // evaluation_comment
    `## 評価コメント

本授業はクラウドコンピューティングの理論と実践をバランスよく学べる優れた設計となっています。

### 特に評価できる点

1. **ハンズオン演習の充実**: 実際のクラウド環境を使った演習により、座学だけでは得られない実践力が身につく
2. **最新技術への対応**: コンテナ・サーバーレス・IaC など、現場で求められる技術を網羅している
3. **キャリアとの接続**: クラウド資格（AWS SAA 等）取得を見据えたカリキュラム構成

### 改善提案

- セキュリティに関する内容をさらに充実させると、より実務に即した内容になる`,
    // university_learning
    `## 大学生のうちに学んでほしいこと

クラウド技術は急速に進化しており、特定のサービスの操作方法よりも**根底にある概念と設計思想**を深く理解することが重要です。

在学中にぜひ取り組んでほしいこと：

1. **基礎となるネットワーク・OS の知識を固める**: クラウドはこれらの延長線上にある
2. **実際に手を動かす**: 無料枠を活用して自分のプロジェクトをデプロイしてみる
3. **クラウド資格の取得**: AWS・Azure・GCP のアソシエイトレベルを目指す
4. **英語の技術文書を読む習慣をつける**: 公式ドキュメントは英語が最新・最正確`,
    yamadaId
  );

  const syllabusId = syllabusResult.lastInsertRowid;

  // ===========================
  // 複数選択（syllabus_review_selections）
  // ===========================
  const insertSelection = db.prepare(`
    INSERT INTO syllabus_review_selections (syllabus_review_id, field_master_id)
    VALUES (?, ?)
  `);

  // 業種: 情報通信業・全業種
  insertSelection.run(syllabusId, getMasterId('industry', '情報通信業'));
  insertSelection.run(syllabusId, getMasterId('industry', '全業種'));

  // 職種: クラウドエンジニア・インフラエンジニア
  insertSelection.run(syllabusId, getMasterId('occupation', 'クラウドエンジニア'));
  insertSelection.run(syllabusId, getMasterId('occupation', 'インフラエンジニア'));

  // ===========================
  // コマシラバス（第1〜3回）
  // ===========================
  const insertKoma = db.prepare(`
    INSERT INTO koma_syllabi (
      syllabus_review_id, session_number,
      learning_overview, learning_objectives,
      created_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  insertKoma.run(
    syllabusId, 1,
    'クラウドコンピューティングの概要とサービスモデル（IaaS/PaaS/SaaS）について学ぶ。主要クラウドベンダー（AWS・Azure・GCP）の特徴と市場シェアを把握する。',
    '・クラウドコンピューティングの定義と特徴を説明できる\n・IaaS/PaaS/SaaS の違いを具体例を挙げて説明できる\n・主要3クラウドの強みと弱みを比較できる',
    yamadaId
  );

  insertKoma.run(
    syllabusId, 2,
    'AWS の主要サービス（EC2・S3・RDS・VPC）を学び、ハンズオン演習でWebサーバーを構築する。セキュリティグループとIAMの基本的な使い方を習得する。',
    '・EC2 インスタンスを起動し SSH で接続できる\n・S3 バケットを作成しファイルを操作できる\n・VPC とセキュリティグループを設定してアクセス制御ができる',
    yamadaId
  );

  insertKoma.run(
    syllabusId, 3,
    'コンテナ技術（Docker）とコンテナオーケストレーション（Kubernetes）の基礎を学ぶ。AWS ECS / EKS を使ったコンテナデプロイの流れを理解する。',
    '・Docker イメージのビルドとコンテナの起動ができる\n・Dockerfile を作成してアプリケーションをコンテナ化できる\n・ECS を使ってコンテナをクラウド上にデプロイできる',
    yamadaId
  );

  // ===========================
  // 課題レビュー（課題番号1〜3）
  // ===========================
  const insertAssignment = db.prepare(`
    INSERT INTO assignment_reviews (
      syllabus_review_id, academic_year, assignment_number,
      assignment_name, evaluation_id, evaluation_comment, university_learning,
      created_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  // 課題1: 評価「秀」
  insertAssignment.run(
    syllabusId, 2025, 1,
    'クラウドサービス比較レポート',
    getMasterId('evaluation', '秀'),
    `## 評価コメント（課題1）

AWS・Azure・GCP を業種別ユースケースで比較した本レポートは、非常に高い完成度です。

- 各クラウドの技術的優位性だけでなく、コスト・サポート体制まで多角的に分析している点が秀逸
- 実際の導入事例を引用し、根拠のある比較ができている
- 図表を効果的に活用し、読みやすいレポートに仕上がっている`,
    `在学中に複数のクラウドに触れ、**ベンダーロックインのリスク**と**マルチクラウド戦略**について深く考えてほしい。`,
    yamadaId
  );

  // 課題2: 評価「優」
  insertAssignment.run(
    syllabusId, 2025, 2,
    'AWS を使った静的Webサイト構築',
    getMasterId('evaluation', '優'),
    `## 評価コメント（課題2）

S3 + CloudFront を使った静的サイト配信を正しく実装できています。

- HTTPS 化（ACM 証明書の取得）まで対応できており、実践的な知識が身についている
- カスタムドメインの設定も完了しており、一通りの構築フローを習得できている
- さらに発展させるなら、CI/CD パイプライン（GitHub Actions）と組み合わせると実務レベルに近づく`,
    `Webサイト公開の仕組みを「なんとなく」ではなく、**DNS・CDN・TLS の仕組みを根本から**理解した上で使いこなせるようになってほしい。`,
    yamadaId
  );

  // 課題3: 評価「良」
  insertAssignment.run(
    syllabusId, 2025, 3,
    'サーバーレスアーキテクチャ設計',
    getMasterId('evaluation', '良'),
    `## 評価コメント（課題3）

Lambda + API Gateway を使ったサーバーレス設計の基本は理解できています。

- 関数の役割分担は適切で、シンプルな設計になっている
- コールドスタートの問題への対策が考慮されていない点が惜しい
- DynamoDB との連携部分でエラーハンドリングが不足しているため、本番環境での使用には改善が必要`,
    `サーバーレスは「サーバーがない」のではなく「サーバーの管理から解放される」という意味です。**課金モデルとスケーリングの仕組み**を深く理解し、向き・不向きを見極める力を養ってほしい。`,
    yamadaId
  );

  console.log('サンプルデータの投入が完了しました');
  console.log('  - ユーザー: yamada, suzuki');
  console.log('  - マスターデータ: 7種別');
  console.log('  - シラバスレビュー: 1件（クラウドコンピューティング 2025年度）');
  console.log('  - コマシラバス: 3件（第1〜3回）');
  console.log('  - 課題レビュー: 3件（課題番号1〜3）');
}

module.exports = { seedDatabase };
