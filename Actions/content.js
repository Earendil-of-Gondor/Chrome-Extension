// Initialize Firebase
var app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app);
var firestoreRef = getFirestore(app);

//cache
var currentUrl;
var currentUrlObj;
var globalCache = new GlobalCache();

//set up functions
async function setUp() {
    currentUrl = $(location).attr('href');
    syncStorageSet(VALUES.STORAGE.CURRENT_URL, currentUrl);
    currentUrlObj = new URL(currentUrl);

    chrome.storage.sync.get(VALUES.STORAGE.IS_RECORDING_ACTIONS, result => {
        const isRecording = result[VALUES.STORAGE.IS_RECORDING_ACTIONS];
        globalCache.globalEventsHandler.setIsRecordingCache(isRecording);
        if (!isRecording) {
            checkFollowingTutorialStatus();
        }
    })
    //setUpIframeListner();
}

function setUpIframeListner() {
    getFrameContents();
    function getFrameContents() {
        const iFrame = document.getElementsByTagName('iframe')[0];
        if (isNotNull(iFrame)) {
            return;
        }
        if (isNotNull(iFrame.contentDocument)) {
            setTimeout(() => {
                getFrameContents();
            }, 1000);
            return;
        }
        let iFrameBody = iFrame.contentDocument.getElementsByTagName('body')[0];

        let iFrameBodyJQ = $(iFrameBody);
        iFrameBodyJQ.on('click', async (event) => {
            onClickUniversalHandler(event);
        })
    }
}
$(() => {
    setUp();
})

//------------------------------------------------------------------------------------------------------------
//------------------------------------------------------------------------------------------------------------
//MARK: Start of giving suggestions
//------------------------------------------------------------------------------------------------------------
//------------------------------------------------------------------------------------------------------------
function automationSpeedSliderHelper(parent = mainPopUpContainer) {
    parent.append(automationSpeedSlider);
    automationSpeedSlider.on('change', () => {
        onAutomationSpeedSliderChanged();
    })
    chrome.storage.sync.get(VALUES.STORAGE.AUTOMATION_SPEED, result => {
        automationSpeedSlider.val(result[VALUES.STORAGE.AUTOMATION_SPEED]);
    })
}

async function fetchSimpleTutorials() {
    mainPopUpContainer.empty();
    automationSpeedSliderHelper();
    const domainName = "https://" + currentUrlObj.hostname + "/";
    const url_matches = [currentUrl, domainName];
    const simpleTutorialQuery = query(collection(firestoreRef,
        VALUES.FIRESTORE_CONSTANTS.SIMPLE_TUTORIAL),
        where(
            VALUES.FIRESTORE_CONSTANTS.SIMPLE_TUTORIAL_ALL_URLS,
            VALUES.FIRESTORE_QUERY_TYPES.ARRAY_CONTAINS_ANY,
            url_matches
        ));

    const simpleTutorialQuerySnapshot = await getDocs(simpleTutorialQuery);

    if (!simpleTutorialQuerySnapshot.empty) {
        //create popup window
        if (mainPopUpContainer.is(":hidden")) {
            mainPopUpContainer.show();
            mainPopUpContainer.append(mainDraggableArea);
            makeElementDraggable(mainDraggableArea[0], mainPopUpContainer[0]);
        }
        //iterate query to add tutorial buttons
        simpleTutorialQuerySnapshot.forEach((tutorial) => {
            mainPopUpContainer.append(`<a class=\"simple-tutorial-button\" id=\"${tutorial.id}\">${tutorial.data().name}</a>`);
            const button = $(`#${tutorial.id}`).first();
            button.css(CSS.MAIN_OPTIONS_POPUP_SIMPLE_TUTORIAL_BUTTON);
            //button click function. store tutorial's steps to storage
            button.on('click', () => {
                onFollowTutorialButtonClicked(tutorial);
            });
        });
    }
};


function createAndShowOptionsContainer() {
    mainStopOptionsContainer.show();
    mainStopOptionsContainer.append(optionsDraggableArea);
    makeElementDraggable(optionsDraggableArea[0], mainStopOptionsContainer[0]);
}

function createAndShowMiddlePopupContainer() {
    mainMiddlePopupContainer.show();
    mainMiddlePopupContainer.append(middleDraggableArea);
    makeElementDraggable(middleDraggableArea[0], mainMiddlePopupContainer[0]);
    popUpStepName.html('');
    popUpStepDescription.html('');
    popUpNextStepButton.hide();
}


var startTutorialButtonClicked = false;
async function onFollowTutorialButtonClicked(tutorial) {
    //toogle html elements
    globalCache.reHighlightAttempt = 0;
    mainPopUpContainer.hide();
    createAndShowOptionsContainer();
    automationSpeedSliderHelper(mainStopOptionsContainer, true);
    createAndShowMiddlePopupContainer();

    popUpAutomateButton.on('click', () => {
        if (!startTutorialButtonClicked) {
            startTutorialButtonClicked = true;
            onPopUpAutomateButtonClicked(tutorial);
        }
    })

    popUpManualButton.on('click', () => {
        if (!startTutorialButtonClicked) {
            startTutorialButtonClicked = true;
            onPopUpManualButtonClicked(tutorial);
        }
    })
}

async function onPopUpAutomateButtonClicked(tutorial) {
    if (globalCache.tutorialObj !== null) {
        return;
    }
    loadTutorialToStorage(tutorial).then(() => {
        syncStorageSet(VALUES.FOLLOWING_TUTORIAL_STATUS.STATUS, VALUES.FOLLOWING_TUTORIAL_STATUS.IS_AUTO_FOLLOWING_TUTORIAL);
        globalCache.globalEventsHandler.setFollwingTutorialStatusCache(VALUES.FOLLOWING_TUTORIAL_STATUS.IS_AUTO_FOLLOWING_TUTORIAL);
        showTutorialStepAuto();
        popUpNextStepButton.show();
    })
}

async function onPopUpManualButtonClicked(tutorial) {
    if (globalCache.tutorialObj !== null) {
        return;
    }
    loadTutorialToStorage(tutorial).then(() => {
        syncStorageSet(VALUES.FOLLOWING_TUTORIAL_STATUS.STATUS, VALUES.FOLLOWING_TUTORIAL_STATUS.IS_MANUALLY_FOLLOWING_TUTORIAL);
        globalCache.globalEventsHandler.setFollwingTutorialStatusCache(VALUES.FOLLOWING_TUTORIAL_STATUS.IS_MANUALLY_FOLLOWING_TUTORIAL);
        showTutorialStepManual();
        popUpNextStepButton.show();
    })
}

async function loadTutorialToStorage(tutorial) {
    syncStorageSet(VALUES.TUTORIAL_ID.CURRENT_FOLLOWING_TUTORIAL_ID, tutorial.id);
    //get all information about the tutorial from firebase
    const stepsQuery = query(collection(firestoreRef,
        VALUES.FIRESTORE_CONSTANTS.SIMPLE_TUTORIAL,
        tutorial.id,
        VALUES.FIRESTORE_CONSTANTS.SIMPLE_TUTORIAL_STEPS
    ), orderBy(VALUES.FIRESTORE_CONSTANTS.STEP_INDEX));
    const stepsQuerySnapshot = await getDocs(stepsQuery);
    //construct steps array from query
    var steps = [];
    //TODO!: solve url problem (possibly using regex)
    var isFirstStepReached = false;
    stepsQuerySnapshot.forEach((step) => {
        const data = step.data();
        //remove steps used prior to accessing this page
        if (isFirstStepReached) {
            steps.push(data);
        } else {
            // if (url[0] === '/') {
            //     //regex
            //     const regex = new RegExp(url.substr(1, url.length - 2));
            //     if (regex.test(currentUrl)) {
            //         isFirstStepReached = true;
            //         steps.push(data);
            //     }
            // } else {
            //     if (url === currentUrl) {
            //         isFirstStepReached = true;
            //         steps.push(data);
            //     }
            // }
            if (checkIfUrlMatch(data.url, currentUrl)) {
                isFirstStepReached = true;
                steps.push(data);
            }
        }
    })

    //construct tutorial object
    const tutorialObj = new SimpleTutorial(steps)
    syncStorageSet(VALUES.TUTORIAL_ID.CURRENT_FOLLOWING_TUTORIAL_OBJECT_ID, tutorialObj);
    globalCache.tutorialObj = tutorialObj;
}

async function onStopTutorialButtonClicked() {
    //clear stuff
    clearInterval(globalCache.highlightedElementInterval);
    isNotNull(globalCache.lastHighlightedElement) && globalCache.lastHighlightedElement.stop();
    removeLastHighlight();

    startTutorialButtonClicked = false;

    //UI
    mainStopOptionsContainer.hide();
    mainMiddlePopupContainer.hide();
    popUpNextStepButton.hide();

    const data = {};
    data[VALUES.FOLLOWING_TUTORIAL_STATUS.STATUS] = VALUES.FOLLOWING_TUTORIAL_STATUS.NOT_FOLLOWING_TUTORIAL;
    data[VALUES.TUTORIAL_ID.CURRENT_FOLLOWING_TUTORIAL_OBJECT_ID] = null;
    data[VALUES.STORAGE.REVISIT_PAGE_COUNT] = 0;
    syncStorageSetBatch(data);

    globalCache = new GlobalCache();

    fetchSimpleTutorials();
}

function prepareTutorialIfIsFollowing(recordingStatus, afterPrepare) {
    //check if on right page
    chrome.storage.sync.get([VALUES.TUTORIAL_ID.CURRENT_FOLLOWING_TUTORIAL_OBJECT_ID], result => {
        const tutorialObj = result[VALUES.TUTORIAL_ID.CURRENT_FOLLOWING_TUTORIAL_OBJECT_ID];
        const currentStep = tutorialObj.steps[tutorialObj.currentStep];

        globalCache.tutorialObj = tutorialObj;
        globalCache.currentStep = currentStep;

        if (checkIfUrlMatch(currentStep.url, currentUrl)) {
            createAndShowOptionsContainer();
            createAndShowMiddlePopupContainer();
            popUpNextStepButton.show();

            globalCache.globalEventsHandler.setFollwingTutorialStatusCache(recordingStatus);

            afterPrepare();
        } else {
            //TODO
        }
    });
}

async function checkFollowingTutorialStatus() {
    chrome.storage.sync.get(VALUES.FOLLOWING_TUTORIAL_STATUS.STATUS, (result) => {
        const recordingStatus = result[VALUES.FOLLOWING_TUTORIAL_STATUS.STATUS];
        globalCache.globalEventsHandler.setFollwingTutorialStatusCache(recordingStatus);
        switch (result[VALUES.FOLLOWING_TUTORIAL_STATUS.STATUS]) {
            case VALUES.FOLLOWING_TUTORIAL_STATUS.IS_MANUALLY_FOLLOWING_TUTORIAL:
                prepareTutorialIfIsFollowing(recordingStatus, showTutorialStepManual);
                break;
            case VALUES.FOLLOWING_TUTORIAL_STATUS.IS_AUTO_FOLLOWING_TUTORIAL:
                prepareTutorialIfIsFollowing(recordingStatus, showTutorialStepAuto);
                break;
            case VALUES.FOLLOWING_TUTORIAL_STATUS.NOT_FOLLOWING_TUTORIAL:
                fetchSimpleTutorials();
                break;
            default:
                fetchSimpleTutorials();
                break;
        }
    })
}

//INCOMPLETE
function onEnteredWrongPage(tutorialObj, urlToMatch) {
    for (let i = 0; i < tutorialObj.steps.length; i++) {
        const currentStep = tutorialObj.steps[i];
        if (currentStep.url === urlToMatch) {
            //show the matched step
            tutorialObj.currentStep = i;
            const RPCKey = VALUES.STORAGE.REVISIT_PAGE_COUNT;
            chrome.storage.sync.get([RPCKey], result => {
                if (result[RPCKey] > VALUES.STORAGE.MAX_REVISIT_PAGE_COUNT) {
                    alert('no matching page');
                    onStopTutorialButtonClicked();
                    return false;
                }
                syncStorageSet(RPCKey, result[RPCKey] + 1, () => {
                    syncStorageSet(VALUES.TUTORIAL_ID.CURRENT_FOLLOWING_TUTORIAL_OBJECT_ID, tutorialObj, () => {
                        showTutorialStepAuto();

                        return true;
                    });
                })
            })
        }
    }
}

async function callFunctionOnSwitchStepType(onStepActionClick, onStepActionClickRedirect, onStepActionRedirect, onStepActionInput, onStepActionSelect, onStepSideInstruction) {
    chrome.storage.sync.get([VALUES.TUTORIAL_ID.CURRENT_FOLLOWING_TUTORIAL_OBJECT_ID, VALUES.STORAGE.AUTOMATION_SPEED], result => {
        const tutorialObj = result[VALUES.TUTORIAL_ID.CURRENT_FOLLOWING_TUTORIAL_OBJECT_ID];
        const currentStep = tutorialObj.steps[tutorialObj.currentStep];
        const interval = intervalFromSpeed(result[VALUES.STORAGE.AUTOMATION_SPEED]);

        globalCache.tutorialObj = tutorialObj;
        globalCache.currentStep = currentStep;
        globalCache.interval = interval;

        if (tutorialObj.currentStep >= tutorialObj.steps.length) {
            onStopTutorialButtonClicked();
        }
        // else if (currentUrl !== currentStep.url) {
        //     //onEnteredWrongPage(tutorialObj, currentStep.url);
        // } 
        else {
            //syncStorageSet(VALUES.STORAGE.REVISIT_PAGE_COUNT, 0);
            switch (currentStep.actionType) {
                case VALUES.STEP_ACTION_TYPE.STEP_ACTION_TYPE_CLICK:
                    //alert('bingo')
                    isNotNull(onStepActionClick) && onStepActionClick();
                    break;
                case VALUES.STEP_ACTION_TYPE.STEP_ACTION_TYPE_CLICK_REDIRECT:
                    isNotNull(onStepActionClickRedirect) && onStepActionClickRedirect(false);
                    break;
                case VALUES.STEP_ACTION_TYPE.STEP_ACTION_TYPE_REDIRECT:
                    isNotNull(onStepActionRedirect) && onStepActionRedirect();
                    break;
                case VALUES.STEP_ACTION_TYPE.STEP_ACTION_TYPE_INPUT:
                    isNotNull(onStepActionInput) && onStepActionInput();
                    break;
                case VALUES.STEP_ACTION_TYPE.STEP_ACTION_TYPE_SELECT:
                    isNotNull(onStepActionSelect) && onStepActionSelect();
                    break;
                case VALUES.STEP_ACTION_TYPE.STEP_ACTION_TYPE_SIDE_INSTRUCTION:
                    isNotNull(onStepSideInstruction) && onStepSideInstruction();
                    break;
                default:
                    alert("Error: Illegal action type")
                    console.error("Illegal action type");
                    break;
            }
        }
    })
}

async function showTutorialStepManual() {
    callFunctionOnSwitchStepType(manualStep, manualStep, manualRedirect, manualInput, manualSelect, manualSideInstruction);
}

var timer = null;

popUpNextStepButton.on('click', event => {
    //stop timers and animations
    isNotNull(globalCache.currentJQScrollingParent) && globalCache.currentJQScrollingParent.stop();
    isNotNull(timer) && clearTimeout(timer);
    removeLastHighlight();
    globalCache.currentJQScrollingParent = null;
    timer = null;
    globalCache.highlightedElementInterval = null;
    //auto go to next step
    globalCache.isAutomatingNextStep = true;
    showTutorialStepAuto();
})

//------------------------------------------------------------------------------------------------------------
//------------------------------------------------------------------------------------------------------------
//MARK: Walk me through screen actions
//------------------------------------------------------------------------------------------------------------
//------------------------------------------------------------------------------------------------------------
function manualStep(showNext = true) {
    const click = globalCache.currentStep.actionObject.defaultClick;
    //const element = $(jqueryElementStringFromDomPath(click.path)).first();
    if (click.useAnythingInTable) {
        highlightAndScollTo(click.table);
    } else {
        highlightAndScollTo(click.path);
    }
    //UI
    updateStepInstructionUIHelper();
}

function manualRedirect(showNext = true) {
    const click = globalCache.currentStep.actionObject.defaultClick;
    if (click.useAnythingInTable) {
        highlightAndScollTo(click.table);
    } else {
        highlightAndScollTo(click.path);
    }
    //UI
}

function manualInput(showNext = true) {
    const inputObj = globalCache.currentStep.actionObject;
    //const element = $(jqueryElementStringFromDomPath(inputObj.path)).first();
    highlightAndScollTo(inputObj.path);
    //UI
    updateStepInstructionUIHelper();
}

function manualSelect(showNext = true) {
    const click = globalCache.currentStep.actionObject.defaultClick;
    //UI
}

function manualSideInstruction(showNext = true) {
    const sideInstructionObj = globalCache.currentStep.actionObject;
    highlightAndScollTo(sideInstructionObj.path);
    //UI
    updateStepInstructionUIHelper();
    globalCache.sideInstructionAutoNextTimer = setTimeout(() => {
        incrementCurrentStepHelper(showNext, false);
    }, 3000);
}

function updateStepInstructionUIHelper() {
    popUpStepName.html(globalCache.currentStep.name);
    popUpStepDescription.html(globalCache.currentStep.description);
}

//------------------------------------------------------------------------------------------------------------
//------------------------------------------------------------------------------------------------------------
//MARK: Automating tutorial functions
//------------------------------------------------------------------------------------------------------------
//------------------------------------------------------------------------------------------------------------
async function showTutorialStepAuto() {
    callFunctionOnSwitchStepType(autoClick, autoClick, autoRedirect, autoInput, autoSelect, autoSideInstruction)
}

function autoClick(showNext = true) {
    const step = globalCache.currentStep.actionObject.defaultClick;
    if (step.useAnythingInTable || globalCache.currentStep.automationInterrupt) {
        //stop automation
        globalCache.globalEventsHandler.setIsAutomationInterrupt(true);
        manualStep(showNext);
        return;
    }
    const element = $(jqueryElementStringFromDomPath(step.path))[0];
    highlightAndScollTo(step.path, () => {
        simulateClick(element);
        incrementCurrentStepHelper(showNext);
    });
}


function autoRedirect() {
    const url = globalCache.currentStep.actionObject.url;
    globalCache.tutorialObj.currentStep += 1;
    syncStorageSet(VALUES.TUTORIAL_ID.CURRENT_FOLLOWING_TUTORIAL_OBJECT_ID, globalCache.tutorialObj, () => {
        location.replace(url);
    });
}

function autoInput() {
    const step = globalCache.currentStep.actionObject;
    //get and highlight input element
    const inputEle = $(jqueryElementStringFromDomPath(step.path)).first();

    highlightAndScollTo(step.path, () => {
        //check if there is default input
        const defaultText = step.defaultText;
        // if (isNotNull(defaultText) && !isEmpty(defaultText)) {
        //     //fill input with default
        //     inputEle.val(defaultText);
        //     incrementCurrentStepHelper(tutorialObj);
        // } else {
        //     //asks for input

        // }        
        globalCache.globalEventsHandler.setIsAutomationInterrupt(true);
        return;
    });
}

/**
 * Stimulate any type of click using javascript's dispatch event. Covers cases where jquery.click() or 
 * .trigger('click') don't work
 * @param {HTML Element} element 
 */
function simulateClick(element, eventType = 'click') {
    if (isNotNull(element)) {
        console.log(`simulating click on ${element}`)
        globalCache.isSimulatingClick = true;
        const evt = new MouseEvent(eventType, {
            view: window,
            bubbles: true,
            cancelable: true
        });
        element.dispatchEvent(evt);
    } else {
        console.log('simulateClick: element not found')
    }
}

function autoSelect() {
    const step = globalCache.currentStep.actionObject;
    //get and highlight input element
    const selectEle = $(jqueryElementStringFromDomPath(step.path)).first();
    highlightAndScollTo(step.path, () => {
        //check if there is default input
        selectEle.val(step.defaultValue);
        //this step completed, go to next step
        incrementCurrentStepHelper();
    });
}

function autoSideInstruction() {
    incrementCurrentStepHelper();
}

function incrementCurrentStepHelper(showNext = true, auto = true) {
    globalCache.globalEventsHandler.setIsAutomationInterrupt(false);
    globalCache.tutorialObj.currentStep += 1;
    syncStorageSet(VALUES.TUTORIAL_ID.CURRENT_FOLLOWING_TUTORIAL_OBJECT_ID, globalCache.tutorialObj, () => {
        const realAuto = auto && (globalCache.globalEventsHandler.followingTutorialStatusCache === VALUES.FOLLOWING_TUTORIAL_STATUS.IS_AUTO_FOLLOWING_TUTORIAL)
        if (realAuto) {
            showNext && showTutorialStepAuto();
        } else if (auto) {
            showNext && showTutorialStepManual();
        } else {
            showNext && showTutorialStepManual();
        }
    });
}

function onAutomationSpeedSliderChanged() {
    syncStorageSet(VALUES.STORAGE.AUTOMATION_SPEED, automationSpeedSlider.val());
}

//------------------------------------------------------------------------------------------------------------
//------------------------------------------------------------------------------------------------------------
//MARK: Start of recording events
//------------------------------------------------------------------------------------------------------------
//------------------------------------------------------------------------------------------------------------
function addGlobalEventListenersWhenRecording() {
    $('*').on('blur focus focusin focusout load resize scroll unload dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup error',
        preventDefaultHelper);
    $('*').on('click', onClickHelper);
}

function removeGlobalEventListenersWhenRecording() {
    $('*').off('blur focus focusin focusout load resize scroll unload dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup error',
        preventDefaultHelper);
    $('*').off('click', onClickHelper);
}

function addGlobalEventListenersWhenFollowing() {
    $('*').on('click', onClickHelper);
}

function removeGlobalEventListenersWhenFollowing() {
    $('*').off('click', onClickHelper);
}

/**blur focus focusin focusout load resize scroll unload dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup error
*/

function onClickHelper(event) {
    preventDefaultHelper(event);
    if (event.target !== globalCache.currentElement) {
        if (!globalCache.isSimulatingClick) {
            processEventHelper(event.target);
        }
        globalCache.isSimulatingClick = false;
    }
}

function processEventHelper(target) {
    globalCache.domPath = getShortDomPathStack(target);
    if ($(jqueryElementStringFromDomPath(globalCache.domPath)).length > 1) {
        globalCache.domPath = getCompleteDomPathStack(target);
    }
    console.log(`clicking: ${globalCache.domPath}`);
    globalCache.currentElement = target;
    onClickUniversalHandler();
}

function preventDefaultHelper(event) {
    if (!globalCache.isSimulatingClick && globalCache.globalEventsHandler.isLisentingRecording) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return false
    }
}

async function onClickUniversalHandler() {
    if (globalCache.globalEventsHandler.isLisentingRecording) {
        onClickWhenRecording();
    } else if (globalCache.globalEventsHandler.isLisentingFollowing) {
        switch (globalCache.globalEventsHandler.followingTutorialStatusCache) {
            case VALUES.FOLLOWING_TUTORIAL_STATUS.IS_MANUALLY_FOLLOWING_TUTORIAL:
                onClickWhenFollowingTutorial();
                break;
            default:
                break;
        }
    }
    if (globalCache.globalEventsHandler.isAutomationInterrupt) {
        onClickWhenFollowingTutorial();
    }
}

async function onClickWhenRecording() {
    //get element
    const jQElement = $(globalCache.currentElement);

    syncStorageSet(VALUES.STORAGE.CURRENT_SELECTED_ELEMENT, globalCache.domPath);

    //get table if it exists for tutorial
    const nearestTable = getNearestTableOrList(jQElement[0]);
    if (!isNotNull(nearestTable)) {
        syncStorageSet(VALUES.STORAGE.CURRENT_SELECTED_ELEMENT_PARENT_TABLE, null);
    } else {
        var nearestTablePath = getShortDomPathStack(nearestTable)
        if ($(jqueryElementStringFromDomPath(nearestTablePath)).length > 1) {
            nearestTablePath = getCompleteDomPathStack(nearestTable);
        }
        syncStorageSet(VALUES.STORAGE.CURRENT_SELECTED_ELEMENT_PARENT_TABLE, nearestTablePath);
    }
    //Highlight
    if (jQElement.is('a')) {
        highlightAndRemoveLastHighlight(jQElement.parent());
    } else {
        highlightAndRemoveLastHighlight(jQElement);
    }
}


//------------------------------------------------------------------------------------------------------------
//------------------------------------------------------------------------------------------------------------
//MARK: Handling click when walking through tutorial
//------------------------------------------------------------------------------------------------------------
//------------------------------------------------------------------------------------------------------------
function onClickWhenFollowingTutorial() {
    //TODO: add regexp and handle user mistakes
    console.log('onClickWhenFollowingTutorial');
    callFunctionOnSwitchStepType(onClickWithStepTypeClick, onClickWithStepTypeClick, onClickWithStepTypeRedirect, onClickWithStepTypeInput, null, onClickWithStepTypeSideInstruction);
    function onClickWithStepTypeClick(showNext = true) {
        const click = globalCache.currentStep.actionObject.defaultClick;
        if (click.useAnythingInTable) {
            const tablePath = click.table;
            if (isSubArray(globalCache.domPath, tablePath)) {
                incrementCurrentStepHelper(true, false);
            } else {
                onClickedOnWrongElement(tablePath);
            }
        } else {
            const clickPath = click.path;
            console.log('should click' + clickPath)
            if (isSubArray(globalCache.domPath, clickPath)) {
                incrementCurrentStepHelper(true, false);
                return;
            } else {
                onClickedOnWrongElement(clickPath);
            }
        }
    }

    function onClickWithStepTypeInput(showNext = true) {
        const inputPath = globalCache.currentStep.actionObject.path;
        if (isSubArray(globalCache.domPath, inputPath)) {
            //TODO: record input and go to next step only when inputted one char
            incrementCurrentStepHelper(showNext, false);
            return;
        } else {
            onClickedOnWrongElement(inputPath);
        }
    }

    function onClickWithStepTypeRedirect(showNext = true) {

    }

    function onClickWithStepTypeSideInstruction(showNext = true) {
        const elementPath = globalCache.currentStep.actionObject.path;
        if (isSubArray(globalCache.domPath, elementPath)) {
            clearTimeout(globalCache.sideInstructionAutoNextTimer);
            globalCache.sideInstructionAutoNextTimer = null;
            incrementCurrentStepHelper(showNext, false);
            return;
        } else {
            onClickedOnWrongElement(inputPath);
        }
    }

    function onClickedOnWrongElement(path) {
        //simulateClick(globalCache.currentElement);
        highlightAndScollTo(path);
    }
}

//------------------------------------------------------------------------------------------------------------
//------------------------------------------------------------------------------------------------------------
//MARK: highlight functions
//------------------------------------------------------------------------------------------------------------
//------------------------------------------------------------------------------------------------------------
function highlightAndScollTo(path, callback = () => { }) {
    const jQElement = $(jqueryElementStringFromDomPath(path));
    const htmlElement = jQElement[0];

    if (highlightAndRemoveLastHighlight(jQElement, path, callback)) {
        //Scroll
        const interval = globalCache.isAutomatingNextStep ? 0 : globalCache.interval;
        globalCache.isAutomatingNextStep = false;
        globalCache.currentJQScrollingParent = $(getScrollParent(htmlElement, false));
        var offset = 0;
        const eleOffset = jQElement.offset();
        const scrollParentOffset = globalCache.currentJQScrollingParent.offset();
        if (isNotNull(eleOffset) && isNotNull(scrollParentOffset)) {
            offset = parseInt(eleOffset.top) - parseInt(scrollParentOffset.top) - window.innerHeight / 2
        }
        globalCache.currentJQScrollingParent.animate({
            scrollTop: `+=${offset}px`
        }, interval).promise().then(() => {
            callback();
        })
    }
}

function highlightAndRemoveLastHighlight(jQElement, path = null, callback = null) {
    //if path is null, calling from recording highlight
    if (path !== null) {
        //Repeat if element not found, might not be handled here
        if (!isNotNull(jQElement[0])) {
            if (globalCache.reHighlightAttempt > 5) {
                //stop refinding element
                console.error("ELEMENT NOT FOUND");
                //onStopTutorialButtonClicked();
                return false;
            }
            globalCache.reHighlightAttempt++;
            setTimeout(() => {
                timer = highlightAndScollTo(path, callback);
            }, 300);
            return false;
        }
        globalCache.reHighlightAttempt = 0;
    }

    removeLastHighlight();
    globalCache.lastHighlightedElement = jQElement;
    globalCache.lastHighlightedElementCSS = jQElement.css(['box-shadow', 'padding', 'border', 'border-radius']);
    jQElement.css(CSS.HIGHLIGHT_BOX);
    alertElement(jQElement);
    return true;
}

function removeLastHighlight() {
    if (isNotNull(globalCache.lastHighlightedElement)) {
        globalCache.lastHighlightedElement.stop();
        clearInterval(globalCache.highlightedElementInterval)
        globalCache.lastHighlightedElement.css(globalCache.lastHighlightedElementCSS);
    }
}

function alertElement(element) {
    var perAnimationBorderLoopCount = 0;

    borderOut();

    globalCache.highlightedElementInterval = setInterval(() => {
        element.stop();
        borderOut();
    }, 3000);

    function borderOut() {
        element.animate({
            borderWidth: '8px',
            color: "rgb( 255, 0, 0 )",
        }, 200).promise().then(() => {
            borderIn();
        });
    }

    function borderIn() {
        element.animate({
            borderWidth: '2px',
            color: "rgb( 255, 110, 20 )",
        }, 200).promise().then(() => {
            if (++perAnimationBorderLoopCount < 3) {
                borderOut();
            } else {
                element.stop();
                perAnimationBorderLoopCount = 0;
            }
        });
    }
}


//------------------------------------------------------------------------------------------------------------
//------------------------------------------------------------------------------------------------------------
//MARK: message handler
//------------------------------------------------------------------------------------------------------------
//------------------------------------------------------------------------------------------------------------
chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        if (isNotNull(request.redirect)) {
            location.replace(request.redirect)
        }
        if (isNotNull(request.isRecordingStatus)) {
            globalCache.globalEventsHandler.setIsRecordingCache(request.isRecordingStatus);
        }
        if (isNotNull(request.clickPath)) {
            simulateClick($(jqueryElementStringFromDomPath(request.clickPath))[0]);
        }
        if (isNotNull(request.removeHighlight) && request.removeHighlight) {
            removeLastHighlight()
        }
    }
);
