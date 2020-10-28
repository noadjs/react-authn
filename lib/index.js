import React, { useState, useEffect } from 'react';
import { BehaviorSubject } from 'rxjs';

export default ({ fetchSessionValue, redirectToLogin, logOut }) => {
    const STATE_PENDING = 'pending';
    const STATE_SUCCESS = 'success';
    const STATE_ERROR = 'error';

    const session$ = new BehaviorSubject({ state: STATE_PENDING });

    const getSession = () => session$.getValue();

    const fetchAndSetSession = (() => {
        let hasBeenInvoked = false;

        return async () => {
            // No-op after the 1st time the function is invoked.
            if (hasBeenInvoked) {
                return;
            }

            hasBeenInvoked = true;

            try {
                const sessionValue = await fetchSessionValue();
                session$.next({ state: STATE_SUCCESS, value: sessionValue });
            } catch (err) {
                // TODO: Use session$.error()? "Error" and "Complete" notifications may happen only
                // once during the Subject Execution, and there can only be either one of them.
                session$.next({ state: STATE_ERROR, error: err });
            }
        };
    })();

    const logOutAndNullifySession = async () => {
        try {
            await logOut();
            session$.next({ state: STATE_SUCCESS, value: null });
        } catch (err) {
            // TODO: Use session$.error()? "Error" and "Complete" notifications may happen only once
            // during the Subject Execution, and there can only be either one of them.
            session$.next({ state: STATE_ERROR, error: err });
        }
    };

    const useSession = () => {
        const [session, setSession] = useState(session$.getValue());

        useEffect(() => {
            // TODO: Handle complete?
            const subscription = session$.subscribe({
                next: setSession,
                error: setSession
            });

            return () => {
                subscription.unsubscribe();
            };
        }, []);

        useEffect(() => {
            // Lazy load the session.
            if (session.state === STATE_PENDING) {
                fetchAndSetSession();
            }
        }, [session]);

        return session;
    };

    const useAuthn = () => {
        const session = useSession();

        const [isAuthNRequestPending, setIsAuthNRequestPending] = useState(false);

        // TODO: Improve error handling.
        if (session.state === STATE_ERROR) {
            return { session, isLoading: false, label: 'Error!' };
        }

        if (session.state === STATE_PENDING) {
            return { session, isLoading: true, label: 'Pending' };
        }

        // -- session.state === STATE_SUCCESS

        const onClickFactory = (cb) => async (e) => {
            e.preventDefault();

            if (isAuthNRequestPending) {
                return;
            }

            setIsAuthNRequestPending(true);

            await cb();

            setIsAuthNRequestPending(false);
        };

        if (session.value === null) {
            return {
                session,
                isLoading: isAuthNRequestPending,
                label: 'Log In',
                onClick: onClickFactory(redirectToLogin)
            };
        }

        return {
            session,
            isLoading: isAuthNRequestPending,
            label: 'Log Out',
            onClick: onClickFactory(logOutAndNullifySession)
        };
    };

    const makeAuthnRoute = ({ Route, Redirect }) => ({ children, ...rest }) => {
        const session = useSession(); // eslint-disable-line react-hooks/rules-of-hooks

        const content = (() => {
            // TODO: Improve error handling.
            if (session.state === STATE_ERROR) {
                return <p>Error!</p>;
            }

            if (session.state === STATE_PENDING) {
                return <p>Checking Session...</p>;
            }

            if (session.state !== STATE_SUCCESS || session.value === undefined) {
                throw new Error('Bad Implementation!');
            }

            if (session.value === null) {
                // If there is NOT a valid session, then redirect to the index page.
                return <Redirect to="/" noThrow />;
            }

            return children;
        })();

        return (
            <Route session={session} {...rest}>
                {content}
            </Route>
        );
    };

    return {
        STATE_PENDING,
        STATE_SUCCESS,
        STATE_ERROR,
        getSession,
        useSession,
        useAuthn,
        makeAuthnRoute
    };
};
