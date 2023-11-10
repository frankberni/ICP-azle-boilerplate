import {
    $query,
    $update,
    Record,
    StableBTreeMap,
    Vec,
    match,
    Result,
    nat64,
    ic,
    Opt
} from 'azle';

import { v4 as uuidv4 } from 'uuid';


type Quote = Record<{
    id: string,
    authorId: string,
    author: string,
    quote: string,
    created: nat64,
    lastUpdate: Opt<nat64>
}>;

type Comment = Record<{
    id: string,
    authorId: string,
    authorName: string,
    quoteId: string,
    comment: string,
    created: nat64,
    lastUpdate: Opt<nat64>
}>;

type User = Record<{
    id: string,
    name: string,
    pinCode: string,
    created: nat64,
    lastUpdate: Opt<nat64>
}>;

type NewUserPayload = Record<{
    name: string,
    pinCode: string
}>;

type NewQuotePayload = Record<{
    authorId: string,
    quote: string
}>;

type NewCommentPayload = Record<{
    authorId: string,
    quoteId: string,
    comment: string
}>;

type QuoteToDisplay = Record<{
    id: string,
    quote: string,
    author: string
}>;

type CommentsToDisplay = Record<{
    comment: string,
    author: string
}>; 

const quoteStorage = new StableBTreeMap<string, Quote>(0, 44, 1024);
const userStorage = new StableBTreeMap<string, User>(1, 144, 1024);
const commentStorage = new StableBTreeMap<string, Comment>(2, 44, 1024);

$query
export function getAllQuotes(): Result<Vec<QuoteToDisplay>, string> {
    
    const allQuotes: Quote[] = quoteStorage.values();

    if (allQuotes.length === 0) return Result.Err('At the moment there is no quote...');

    const quoteToReturn: QuoteToDisplay[] = allQuotes.map((singleQuote: Quote) => {
        return {
            id: singleQuote.id,
            quote: singleQuote.quote,
            author: singleQuote.author
        };
    });
    return Result.Ok<Vec<QuoteToDisplay>, string>(quoteToReturn);
};

$query
export function getQuoteComments(quoteId: string): Result<Vec<CommentsToDisplay>, string> {
    
    const allQuotes: Quote[] = quoteStorage.values();
    const quoteById: (Quote | undefined) = allQuotes.find((q: Quote) => q.id === quoteId);

    if (quoteById === undefined) return Result.Err('No quote found with the given ID.');

    const allComments: Comment[] = commentStorage.values();
    const quoteComments: Comment[] = allComments.filter((c: Comment) => c.quoteId === quoteId);

    if (quoteComments.length === 0) return Result.Err('No comments found for this qoute.');

    const commentsToDisplay: CommentsToDisplay[] = quoteComments.map((c: Comment) =>  {
        return {
            comment: c.comment,
            author: c.authorName
        }
    });

    return Result.Ok<Vec<CommentsToDisplay>, string>(commentsToDisplay);
};

$query
export function getMyUserData(payload: NewUserPayload): Result<User, string> {

    const allUsers: User[] = userStorage.values();
    const userData: User[] = allUsers.filter((u: User) => (u.name === payload.name) && (u.pinCode === payload.pinCode));

    if (userData.length === 0) return Result.Err('No user found with this credentials');

    return Result.Ok<User, string>(userData[0]);
};

$update
export function newUser(payload: NewUserPayload): Result<User, string> {

    const allUsers: User[] = userStorage.values();
    const checkUserName: (User | undefined) = allUsers.find((u: User) => u.name === payload.name);

    if (checkUserName !== undefined) return Result.Err('Sorry, this name is already in use...');

    const user: User = {
        id: uuidv4(),
        created: ic.time(),
        lastUpdate: Opt.None,
        ...payload
    };
    userStorage.insert(user.id + user.pinCode, user);
    return Result.Ok<User, string>(user);
};

$update
export function newQuote(newUserQuote: NewQuotePayload): Result<Quote, string> {

    const allUser: User[] = userStorage.values();
    const userThatComments: (User | undefined) = allUser.find((u: User) => u.id === newUserQuote.authorId);
    
    if (userThatComments === undefined) return Result.Err('Author with given ID not found.');

    const quote: Quote = {
        id: uuidv4(),
        created: ic.time(),
        lastUpdate: Opt.None,
        author: userThatComments!.name,
        ...newUserQuote
    };
    quoteStorage.insert(quote.id, quote);
    return Result.Ok<Quote, string>(quote);
};

$update
export function addComment(newComment: NewCommentPayload): Result<Comment, string> {

    const allUser: User[] = userStorage.values();
    const userThatComments: (User | undefined) = allUser.find((u: User) => u.id === newComment.authorId);
    
    if (userThatComments === undefined) return Result.Err('Author with given ID not found.');

    const commentToAdd: Comment = {
        id: uuidv4(),
        authorName: userThatComments!.name,
        created: ic.time(),
        lastUpdate: Opt.None,
        ...newComment
    };
    commentStorage.insert(commentToAdd.id, commentToAdd);

    return Result.Ok<Comment, string>(commentToAdd);
};

$update
export function deleteQuote(quoteId: string, authorId: string): Result<Quote, string> {

    const allQuotes: Quote[] = quoteStorage.values();
    const ownedQuota: (Quote | undefined) = allQuotes.find((q: Quote) => (q.id === quoteId) && (q.authorId === authorId));

    if (ownedQuota === undefined) return Result.Err('You can not delete the qoute because you are not the owner.');

    return match(quoteStorage.remove(quoteId), {

        Some: (deletedQuote: Quote) => {

            const allComments: Comment[] = commentStorage.values();
            const commentsToDelete: Comment[] = allComments.filter((c: Comment) => c.quoteId === quoteId);

            if (commentsToDelete.length !== 0) {
                commentsToDelete.forEach((c: Comment) => deleteComment(quoteId, c.id, authorId));
            }

            return Result.Ok<Quote, string>(deletedQuote)
        },
        None: () => Result.Err<Quote, string>('Quote with given Id not found.')
    });
};

$update
export function deleteComment(quoteId: string, commentId: string, authorId: string): Result<Comment, string> {

    return match(commentStorage.remove(commentId), {

        Some: (commentToDelete: Comment) => {
              
            if (commentToDelete.quoteId !== quoteId) return Result.Err<Comment, string>('This comment is not on the given qoute.');
            if (commentToDelete.authorId !== authorId) return Result.Err<Comment, string>('Unable to delete the comment, you are not the author.');

            return Result.Ok<Comment, string>(commentToDelete);
        },
        None: () => Result.Err<Comment, string>('Comment with given Id not found.')
    });
};

$update
export function deleteUser(userId: string, pinCode: string): Result<User, string> {

    const allUser: User[] = userStorage.values();
    const userById: (User | undefined) = allUser.find((u: User) => u.id === userId);

    if (userById?.pinCode !== pinCode) return Result.Err<User, string>('Unable to delete user, wrong credentials.');

    return match(userStorage.remove(userId + pinCode), {

        Some: (userToDelete: User) => {

            const allQuotes: Quote[] = quoteStorage.values();
            const userQuotes: Quote[] = allQuotes.filter((q: Quote) => q.authorId === userId);

            if (userQuotes.length !== 0) {

                userQuotes.forEach((q: Quote) => {
                    deleteQuote(q.id, userId);
                });
            }

            return Result.Ok<User, string>(userToDelete);
        },
        None: () => Result.Err<User, string>('No user found with those credentials.')
    });
};

globalThis.crypto = {
    // @ts-ignore
   getRandomValues: () => {
    
       let array = new Uint8Array(32);

       for (let i = 0; i < array.length; i++) {
           array[i] = Math.floor(Math.random() * 256);
       }

       return array;
   }
};
