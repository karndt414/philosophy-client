// src/App.js
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient'; // Import your client
import './App.css';

function App() {
  // This session object is our new "source of truth"
  const [session, setSession] = useState(null);

  // Form states
  const [isSignUp, setIsSignUp] = useState(false); // To toggle between Sign In/Sign Up
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [usernameInput, setUsernameInput] = useState(''); // For their chosen username
  const [questions, setQuestions] = useState([]);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [newQuestionTitle, setNewQuestionTitle] = useState('');
  const messagesEndRef = useRef(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // 1. Fetch all questions on component mount
  useEffect(() => {
    async function getQuestions() {
      const { data, error } = await supabase.from('questions').select('*');
      if (error) console.error('Error fetching questions:', error);
      else setQuestions(data);
    }
    getQuestions();
  }, []);

  // 2. Fetch messages when a question is selected
  useEffect(() => {
    if (selectedQuestion) {
      async function getMessages() {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('question_id', selectedQuestion.id)
          .order('created_at', { ascending: true });

        if (error) console.error('Error fetching messages:', error);
        else setMessages(data);
      }
      getMessages();
    }
  }, [selectedQuestion]);

  // 3. Listen for REAL-TIME new messages
  useEffect(() => {
    if (!selectedQuestion) return;

    const channel = supabase
      .channel(`question_room_${selectedQuestion.id}`)
      .on(
        'postgres_changes',
        {
          event: '*', // <-- CHANGE 'INSERT' TO '*'
          schema: 'public',
          table: 'messages',
          filter: `question_id=eq.${selectedQuestion.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            // A new message has arrived!
            setMessages((prevMessages) => [...prevMessages, payload.new]);
          }
          if (payload.eventType === 'DELETE') {
            // A message was deleted!
            // payload.old.id will give us the ID of the deleted message
            setMessages((prevMessages) =>
              prevMessages.filter((msg) => msg.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();

    // Cleanup: Unsubscribe when the component unmounts or question changes
    return () => {
      supabase.removeChannel(channel);
    };

  }, [selectedQuestion]);

  // 4. Listen for REAL-TIME new questions (ADD THIS)
  useEffect(() => {
    const channel = supabase
      .channel('all-questions')
      .on(
        'postgres_changes',
        {
          event: '*', // <-- CHANGE 'INSERT' TO '*'
          schema: 'public',
          table: 'questions',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            // Add the new question to our list
            setQuestions((prevQuestions) => [...prevQuestions, payload.new]);
          }
          if (payload.eventType === 'DELETE') {
            // A question was deleted!
            setQuestions((prevQuestions) =>
              prevQuestions.filter((q) => q.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();

    // Cleanup
    return () => {
      supabase.removeChannel(channel);
    };
  }, []); // Run this only once when the app loads

  // 5. MASTER AUTH HOOK
  useEffect(() => {

    // This new helper function checks for admin status
    const checkAdminStatus = async (user) => {
      if (user) {
        // Fetch the user's profile
        const { data, error } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .single(); // Get just one row

        if (data && data.is_admin) {
          setIsAdmin(true); // They are an admin!
        } else {
          setIsAdmin(false); // Not an admin
        }
      } else {
        // No user, definitely not an admin
        setIsAdmin(false);
      }
    };

    // Check if a user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      checkAdminStatus(session?.user); // Check admin status on initial load
    });

    // Listen for auth events (Sign In, Sign Out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        checkAdminStatus(session?.user); // Re-check admin status on any auth change
      }
    );

    // Cleanup
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Auto-scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- Event Handlers ---

  const handleSignUp = async (e) => {
    e.preventDefault();
    if (!emailInput || !passwordInput || !usernameInput) {
      alert("Please fill out all fields.");
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: emailInput,
      password: passwordInput,
      options: {
        data: {
          // This is how we save their chosen username
          username: usernameInput,
        },
      },
    });

    if (error) {
      alert(error.message);
    } else if (data.user) {
      alert("Sign up successful! You are now logged in.");
    }
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({
      email: emailInput,
      password: passwordInput,
    });

    if (error) {
      alert(error.message);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleAddQuestion = async (e) => {
    e.preventDefault();
    if (newQuestionTitle.trim() === '') {
      alert('Please fill out the question title.');
      return;
    }

    // NEW: Add confirmation
    if (!window.confirm('Are you sure you want to add this question?')) {
      return;
    }

    // NEW: No password in the body
    const { data, error } = await supabase.functions.invoke('RealTime', {
      body: {
        title: newQuestionTitle,
      },
    });

    if (error) {
      alert(`Error: ${error.message}`);
    } else {
      console.log('New question added:', data);
      setNewQuestionTitle('');
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    // NEW: Add confirmation
    if (!window.confirm('Are you sure you want to delete this question and all its messages?')) {
      return;
    }

    // NEW: No password in the body
    const { error } = await supabase.functions.invoke('delete-question', {
      body: {
        question_id: questionId,
      },
    });

    if (error) {
      alert(`Error: ${error.message}`);
    } 
  };

  const handleDeleteMessage = async (messageId) => {
    // NEW: Add confirmation
    if (!window.confirm('Are you sure you want to delete this message?')) {
      return;
    }

    // NEW: No password in the body
    const { error } = await supabase.functions.invoke('delete-message', {
      body: {
        message_id: messageId,
      },
    });

    if (error) {
      alert(`Error: ${error.message}`);
    } 
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (newMessage.trim() === '' || !selectedQuestion) return;

    // NEW: Get username from the secure session
    const currentUsername = session.user.user_metadata.username;

    // Send the new message to the Supabase database
    const { error } = await supabase.from('messages').insert({
      question_id: selectedQuestion.id,
      username: currentUsername, // <-- NEW SECURE WAY
      content: newMessage,
      is_admin: isAdmin,
    });

    if (error) console.error('Error sending message:', error);

    setNewMessage(''); // Clear the input box
  };

  // --- Render ---
  // (This JSX is almost identical to your old file, so I'm
  // including it for completeness. I just removed the admin form for now.)
  if (!session) {
    return (
      <div className="login-container">
        <form className="login-box" onSubmit={isSignUp ? handleSignUp : handleSignIn}>
          <h2>{isSignUp ? 'Create Account' : 'Welcome to TigerTalks'}</h2>
          <p>
            {isSignUp
              ? 'Sign up with your @bentonvillek12.org account'
              : 'Sign in with your @bentonvillek12.org account'}
          </p>

          {/* This field ONLY shows on Sign Up */}
          {isSignUp && (
            <input
              type="text"
              placeholder="Choose a Username"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
            />
          )}

          <input
            type="email"
            placeholder="School Email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
          />

          <button type="submit" className="login-button">
            {isSignUp ? 'Sign Up' : 'Login'}
          </button>

          <button
            type="button"
            className="toggle-button"
            onClick={() => setIsSignUp(!isSignUp)}
          >
            {isSignUp
              ? 'Already have an account? Sign In'
              : "Don't have an account? Sign Up"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="App">
      <div className="sidebar">
        <h2>Tiger Talks</h2>
        <div className="user-info">
          <span>
            Signed in as: <strong>{session.user.user_metadata.username}</strong>
          </span>
          <button onClick={handleSignOut} className="sign-out-btn">
            Sign Out
          </button>
        </div>
        {isAdmin && (
          <details className="admin-details">
            <summary>Add Question</summary>
              <form className="admin-form" onSubmit={handleAddQuestion}>
                <input
                  type="text"
                  placeholder="New question title"
                  value={newQuestionTitle}
                  onChange={(e) => setNewQuestionTitle(e.target.value)}
                />
                <button type="submit">Add</button>
              </form>
            </details>
          )}
        <ul>
          {questions.map((q) => (
            <li
              key={q.id}
              className={selectedQuestion?.id === q.id ? 'active' : ''}
              onClick={() => setSelectedQuestion(q)}
            >
              {q.title}
              {isAdmin && (
                <button
                  className="delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteQuestion(q.id);
                  }}
                >
                  &times;
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="chat-room">
        {selectedQuestion ? (
          <>
            <h2>{selectedQuestion.title}</h2>
            <div className="message-list">
              {messages.map((msg) => (
                <div key={msg.id} className="message">
                  <strong className={msg.is_admin ? 'admin-username' : ''}>
                    {msg.username}:
                  </strong>
                  <span>{msg.content}</span>
                  <small>{new Date(msg.created_at).toLocaleTimeString()}</small>
                  {isAdmin && (
                    <button
                      className="delete-btn"
                      onClick={() => handleDeleteMessage(msg.id)}
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <form className="message-form" onSubmit={handleSendMessage}>
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your thoughts..."
              />
              <button type="submit">Send</button>
            </form>
          </>
        ) : (
          <div className="placeholder">
            <h2>Select a question to start chatting</h2>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;