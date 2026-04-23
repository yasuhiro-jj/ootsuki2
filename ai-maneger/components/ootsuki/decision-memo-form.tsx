"use client";

import { useState } from "react";

interface DecisionMemoFormProps {
  defaultTitle?: string;
  canWrite: boolean;
}

export function DecisionMemoForm({ defaultTitle = "メモ", canWrite }: DecisionMemoFormProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [status, setStatus] = useState("進行中");
  const [summary, setSummary] = useState("");
  const [relatedNumbers, setRelatedNumbers] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [submitStatus, setSubmitStatus] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function clearFeedback() {
    setSubmitStatus("");
    setError("");
  }

  async function submitMemo() {
    if (isSubmitting) return;

    const payload = {
      title: title.trim(),
      status: status.trim(),
      summary: summary.trim(),
      relatedNumbers: relatedNumbers.trim(),
      nextAction: nextAction.trim(),
    };

    if (!payload.summary) {
      setSubmitStatus("");
      setError("要点を入力してください。");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSubmitStatus("保存中です...");

    try {
      const response = await fetch("/api/decision-memo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !result.ok) {
        throw new Error(result.message || "判断メモの保存に失敗しました。");
      }

      setSubmitStatus("保存しました。ページを再読み込みします...");
      setSummary("");
      setRelatedNumbers("");
      setNextAction("");
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (submitError) {
      setSubmitStatus("");
      setError(submitError instanceof Error ? submitError.message : "判断メモの保存に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submitMemo();
      }}
      className="grid gap-3 rounded-[24px] border border-stone-900/10 bg-white px-4 py-4"
    >
      <p className="text-sm font-semibold text-stone-900">判断メモをここで追記</p>
      <p className="text-xs leading-6 text-stone-500">
        NotionのメモDBへ直接保存されます。保存後はこの一覧にも反映されます。
      </p>
      {!canWrite ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          このアカウントは書き込み権限がないため保存できません。`editor` / `admin` / `owner` でログインしてください。
        </div>
      ) : null}

      <label className="grid gap-2 text-sm text-stone-700">
        タイトル
        <input
          type="text"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            clearFeedback();
          }}
          disabled={isSubmitting || !canWrite}
          className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-3 outline-none"
        />
      </label>

      <label className="grid gap-2 text-sm text-stone-700">
        ステータス
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            clearFeedback();
          }}
          disabled={isSubmitting || !canWrite}
          className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-3 outline-none"
        >
          <option value="進行中">進行中</option>
          <option value="検討中">検討中</option>
          <option value="完了">完了</option>
        </select>
      </label>

      <label className="grid gap-2 text-sm text-stone-700">
        要点
        <textarea
          rows={4}
          value={summary}
          onChange={(event) => {
            setSummary(event.target.value);
            clearFeedback();
          }}
          disabled={isSubmitting || !canWrite}
          placeholder="今週の判断の要点を記入"
          className="rounded-[20px] border border-stone-900/10 bg-stone-50 px-4 py-3 leading-7 outline-none"
        />
      </label>

      <label className="grid gap-2 text-sm text-stone-700">
        関連数字
        <textarea
          rows={3}
          value={relatedNumbers}
          onChange={(event) => {
            setRelatedNumbers(event.target.value);
            clearFeedback();
          }}
          disabled={isSubmitting || !canWrite}
          placeholder="例: 売上 前週比 +8.2%"
          className="rounded-[20px] border border-stone-900/10 bg-stone-50 px-4 py-3 leading-7 outline-none"
        />
      </label>

      <label className="grid gap-2 text-sm text-stone-700">
        次アクション
        <textarea
          rows={3}
          value={nextAction}
          onChange={(event) => {
            setNextAction(event.target.value);
            clearFeedback();
          }}
          disabled={isSubmitting || !canWrite}
          placeholder="次に実行する内容を記入"
          className="rounded-[20px] border border-stone-900/10 bg-stone-50 px-4 py-3 leading-7 outline-none"
        />
      </label>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {submitStatus ? (
        <div className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-4 text-sm text-stone-700">
          {submitStatus}
        </div>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={isSubmitting || !canWrite}
          className="inline-flex rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "保存中..." : "判断メモを保存"}
        </button>
      </div>
    </form>
  );
}
