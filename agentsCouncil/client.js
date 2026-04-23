const http = require("http");

async function startCouncil(agentName, request) {
  const response = await fetch("http://localhost:3000/start_council", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ agent_name: agentName, request }),
  });

  if (response.ok) {
    const { session_id } = await response.json();
    return session_id;
  } else {
    throw new Error(`Failed to start council session: ${response.status}`);
  }
}

async function sendResponse(sessionId, content) {
  const response = await fetch("http://localhost:3000/send_response", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": sessionId,
    },
    body: JSON.stringify({ content }),
  });

  if (response.ok) {
    return;
  } else {
    throw new Error(`Failed to send response: ${response.status}`);
  }
}

async function getCurrentSessionData(sessionId) {
  const response = await fetch(
    "http://localhost:3000/get_current_session_data",
    {
      method: "POST",
      headers: {
        "X-Session-Id": sessionId,
      },
    },
  );

  if (response.ok) {
    const { responses, cursor } = await response.json();
    return { responses, cursor };
  } else {
    throw new Error(`Failed to get current session data: ${response.status}`);
  }
}

async function closeCouncil(sessionId, conclusion) {
  const response = await fetch("http://localhost:3000/close_council", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": sessionId,
    },
    body: JSON.stringify({ conclusion }),
  });

  if (response.ok) {
    return;
  } else {
    throw new Error(`Failed to close council session: ${response.status}`);
  }
}

async function joinCouncil(agentName) {
  const response = await fetch("http://localhost:3000/join_council", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ agent_name: agentName }),
  });

  if (response.ok) {
    const { session_id, responses, cursor } = await response.json();
    return { session_id, responses, cursor };
  } else {
    throw new Error(`Failed to join council session: ${response.status}`);
  }

  async function summonAgent(sessionId, agent, model) {
    const response = await fetch("http://localhost:3000/summon_agent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": sessionId,
      },
      body: JSON.stringify({ agent, model }),
    });

    if (response.ok) {
      const { message } = await response.json();
      return message;
    } else {
      throw new Error(`Failed to summon agent: ${response.status}`);
    }
  }
}
