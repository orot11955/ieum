import { useState } from "react";
import { Link, useLocation } from "react-router";
import { Notice } from "@ieum/ui";
import { AcceptInvitationForm } from "../features/invitations/accept-form";
import { AuthFrame } from "./auth-pages";

/**
 * The token travels in the URL fragment, so it is never sent to a server in a
 * request line or Referer header.
 */
export function InvitationPage() {
  const location = useLocation();
  const token = location.hash.slice(1);
  const [accepted, setAccepted] = useState(false);
  const valid = /^[A-Za-z0-9_-]{43}$/.test(token);
  return (
    <AuthFrame title="초대 수락">
      {accepted ? (
        <>
          <Notice tone="success">
            계정을 만들었습니다. 초대받은 이메일로 로그인해 주세요.
          </Notice>
          <Link to="/login">로그인으로 이동</Link>
        </>
      ) : valid ? (
        <AcceptInvitationForm
          token={token}
          onAccepted={() => {
            window.history.replaceState(null, "", location.pathname);
            setAccepted(true);
          }}
        />
      ) : (
        <Notice tone="danger">
          초대 링크가 올바르지 않습니다. 받은 링크 전체를 그대로 열어 주세요.
        </Notice>
      )}
    </AuthFrame>
  );
}
